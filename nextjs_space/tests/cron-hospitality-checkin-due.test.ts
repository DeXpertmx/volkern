import { describe, it, expect, vi, beforeEach } from 'vitest';

// ────────────────────────────────────────────────────────────────────────────
// MOCKS (vi.hoisted)
// ────────────────────────────────────────────────────────────────────────────
const __mockPrisma = vi.hoisted(() => ({
  hospitalityReservation: {
    findMany: vi.fn(),
  },
  automationRule: {
    findMany: vi.fn(),
  },
  hospitalityCommunicationTemplate: {
    findMany: vi.fn(),
  },
  auditLog: {
    findFirst: vi.fn(),
    create: vi.fn(),
  },
}));

const __mockEmitCheckinDue = vi.hoisted(() => vi.fn());
const __mockDisparar = vi.hoisted(() => vi.fn());

vi.mock('@/lib/db', () => ({ prisma: __mockPrisma }));
vi.mock('@/lib/hospitality/events', () => ({
  emitCheckinDue: (...a: any[]) => __mockEmitCheckinDue(...a),
}));
vi.mock('@/lib/hospitality/comunicaciones', () => ({
  dispararComunicacionReserva: (...a: any[]) => __mockDisparar(...a),
}));

import { runHospitalityCheckinDueScan } from '@/lib/cron/hospitality-checkin-due';

function reservation(overrides: Record<string, any> = {}) {
  return {
    id: 'res-1',
    tenantId: 'tenant-a',
    propertyId: 'prop-1',
    unitId: 'unit-1',
    contactId: null,
    channel: 'airbnb',
    externalBookingId: 'HM-123',
    checkIn: new Date(Date.now() + 12 * 3600 * 1000),
    checkOut: new Date(Date.now() + 60 * 3600 * 1000),
    guestData: { nombre: 'Ana López', telefono: '+5215550001111' },
    ...overrides,
  };
}

describe('Cron hospitality_checkin_due (pre-llegada §21 + trigger §22)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __mockPrisma.automationRule.findMany.mockResolvedValue([]);
    __mockPrisma.hospitalityCommunicationTemplate.findMany.mockResolvedValue([]);
    __mockPrisma.auditLog.findFirst.mockResolvedValue(null);
    __mockPrisma.auditLog.create.mockResolvedValue({});
    __mockDisparar.mockResolvedValue([]);
  });

  it('sin candidatos: no emite ni envía nada', async () => {
    __mockPrisma.hospitalityReservation.findMany.mockResolvedValue([]);

    const r = await runHospitalityCheckinDueScan(24);

    expect(r).toEqual({ total: 0, fired: 0, skipped: 0, preLlegadaEnviados: 0, preLlegadaFallidos: 0 });
    expect(__mockEmitCheckinDue).not.toHaveBeenCalled();
    expect(__mockDisparar).not.toHaveBeenCalled();
  });

  it('envía pre_llegada Y emite el evento para un tenant con plantilla activa', async () => {
    __mockPrisma.hospitalityReservation.findMany.mockResolvedValue([reservation()]);
    __mockPrisma.hospitalityCommunicationTemplate.findMany.mockResolvedValue([
      { tenantId: 'tenant-a' },
    ]);
    __mockDisparar.mockResolvedValue([{ templateId: 't1', evento: 'pre_llegada', canal: 'whatsapp', ok: true }]);

    const r = await runHospitalityCheckinDueScan(24);

    expect(r.fired).toBe(1);
    expect(r.preLlegadaEnviados).toBe(1);
    expect(r.preLlegadaFallidos).toBe(0);
    expect(__mockDisparar).toHaveBeenCalledWith({
      tenantId: 'tenant-a',
      reservationId: 'res-1',
      evento: 'pre_llegada',
    });
    expect(__mockEmitCheckinDue).toHaveBeenCalledTimes(1);
    expect(__mockEmitCheckinDue.mock.calls[0][0]).toMatchObject({
      tenantId: 'tenant-a',
      reservationId: 'res-1',
      channel: 'airbnb',
    });
    expect(__mockPrisma.auditLog.create).toHaveBeenCalledTimes(1);
  });

  it('NO reenvía si ya se disparó en las últimas 24h (guard hacia atrás)', async () => {
    __mockPrisma.hospitalityReservation.findMany.mockResolvedValue([reservation()]);
    __mockPrisma.hospitalityCommunicationTemplate.findMany.mockResolvedValue([
      { tenantId: 'tenant-a' },
    ]);
    // Ya hay un log de hace 2h → dentro de la ventana de 24h hacia atrás.
    __mockPrisma.auditLog.findFirst.mockResolvedValue({ id: 'log-1' });

    const r = await runHospitalityCheckinDueScan(24);

    expect(r.fired).toBe(0);
    expect(r.skipped).toBe(1);
    expect(__mockDisparar).not.toHaveBeenCalled();
    expect(__mockEmitCheckinDue).not.toHaveBeenCalled();
  });

  it('el guard usa ventana hacia atrás (gte: since), no gte: now', async () => {
    __mockPrisma.hospitalityReservation.findMany.mockResolvedValue([reservation()]);
    __mockPrisma.hospitalityCommunicationTemplate.findMany.mockResolvedValue([
      { tenantId: 'tenant-a' },
    ]);
    await runHospitalityCheckinDueScan(24);

    const where = __mockPrisma.auditLog.findFirst.mock.calls[0][0].where;
    expect(where.fechaCreacion).toBeDefined();
    // Debe existir un límite inferior anterior al momento de la llamada.
    const lower = where.fechaCreacion.gte as Date;
    expect(lower).toBeInstanceOf(Date);
    expect(lower.getTime()).toBeLessThan(Date.now());
  });

  it('omite tenants sin reglas ni plantilla pre_llegada activa', async () => {
    __mockPrisma.hospitalityReservation.findMany.mockResolvedValue([
      reservation({ tenantId: 'tenant-b' }),
    ]);
    // tenant-b no aparece en ninguna de las dos listas.
    const r = await runHospitalityCheckinDueScan(24);

    expect(r.fired).toBe(0);
    expect(r.skipped).toBe(1);
    expect(__mockDisparar).not.toHaveBeenCalled();
    expect(__mockEmitCheckinDue).not.toHaveBeenCalled();
  });

  it('un fallo de envío de pre_llegada no impide el evento de automatización', async () => {
    __mockPrisma.hospitalityReservation.findMany.mockResolvedValue([reservation()]);
    __mockPrisma.hospitalityCommunicationTemplate.findMany.mockResolvedValue([
      { tenantId: 'tenant-a' },
    ]);
    __mockDisparar.mockResolvedValue([
      { templateId: 't1', evento: 'pre_llegada', canal: 'whatsapp', ok: false, error: 'Evolution rechazó' },
    ]);

    const r = await runHospitalityCheckinDueScan(24);

    expect(r.fired).toBe(1);
    expect(r.preLlegadaEnviados).toBe(0);
    expect(r.preLlegadaFallidos).toBe(1);
    expect(__mockEmitCheckinDue).toHaveBeenCalledTimes(1);
    expect(__mockPrisma.auditLog.create).toHaveBeenCalledTimes(1);
  });

  it('dispara por regla activa aunque el tenant no tenga plantilla', async () => {
    __mockPrisma.hospitalityReservation.findMany.mockResolvedValue([reservation()]);
    __mockPrisma.automationRule.findMany.mockResolvedValue([{ tenantId: 'tenant-a' }]);
    // Sin plantilla → dispararComunicacionReserva devolvería [] (no se llama
    // con plantilla inexistente; el mock devuelve [] igualmente).

    const r = await runHospitalityCheckinDueScan(24);

    expect(r.fired).toBe(1);
    expect(__mockEmitCheckinDue).toHaveBeenCalledTimes(1);
  });
});
