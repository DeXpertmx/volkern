import { describe, it, expect, vi, beforeEach } from 'vitest';

// ────────────────────────────────────────────────────────────────────────────
// MOCKS (vi.hoisted)
// ────────────────────────────────────────────────────────────────────────────
const __mockPrisma = vi.hoisted(() => ({
  hospitalityReservation: {
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

const __mockDisparar = vi.hoisted(() => vi.fn());

vi.mock('@/lib/db', () => ({
  prisma: __mockPrisma,
}));
vi.mock('@/lib/hospitality/comunicaciones', () => ({
  dispararComunicacionReserva: (...a: any[]) => __mockDisparar(...a),
}));

import { runHospitalityReviewRequestScan } from '@/lib/cron/hospitality-review-request';

function reservation(overrides: Record<string, any> = {}) {
  return {
    id: 'res-1',
    tenantId: 'tenant-a',
    propertyId: 'prop-1',
    unitId: 'unit-1',
    checkOut: new Date(Date.now() - 30 * 3600 * 1000),
    externalBookingId: 'HM-123',
    ...overrides,
  };
}

describe('Cron hospitality_review_request (solicitud de reseña §21)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __mockPrisma.hospitalityReservation.findMany.mockResolvedValue([]);
    __mockPrisma.hospitalityCommunicationTemplate.findMany.mockResolvedValue([]);
    __mockPrisma.auditLog.findFirst.mockResolvedValue(null);
    __mockPrisma.auditLog.create.mockResolvedValue({});
    __mockDisparar.mockResolvedValue([]);
  });

  it('sin check-outs candidatos: no envía nada', async () => {
    __mockPrisma.hospitalityReservation.findMany.mockResolvedValue([]);

    const r = await runHospitalityReviewRequestScan(24, 72);

    expect(r).toEqual({ total: 0, enviados: 0, fallidos: 0, skipped: 0 });
    expect(__mockDisparar).not.toHaveBeenCalled();
  });

  it('solo mira check-outs dentro de la ventana (>= ahora-72h y <= ahora-24h)', async () => {
    await runHospitalityReviewRequestScan(24, 72);

    const where = __mockPrisma.hospitalityReservation.findMany.mock.calls[0][0].where;
    expect(where.estado).toBe('checked_out');
    const desde = where.checkOut.gte as Date;
    const hasta = where.checkOut.lte as Date;
    expect(desde).toBeInstanceOf(Date);
    expect(hasta).toBeInstanceOf(Date);
    // La ventana debe ser de 48h (72h hacia atrás menos el retardo de 24h).
    const spanHoras = (hasta.getTime() - desde.getTime()) / 3600_000;
    expect(Math.round(spanHoras)).toBe(48);
  });

  it('envía la reseña y deja el guard por reserva', async () => {
    __mockPrisma.hospitalityReservation.findMany.mockResolvedValue([reservation()]);
    __mockPrisma.hospitalityCommunicationTemplate.findMany.mockResolvedValue([
      { tenantId: 'tenant-a' },
    ]);
    __mockDisparar.mockResolvedValue([
      { templateId: 't1', evento: 'resena', canal: 'whatsapp', ok: true },
    ]);

    const r = await runHospitalityReviewRequestScan(24, 72);

    expect(r.total).toBe(1);
    expect(r.enviados).toBe(1);
    expect(r.fallidos).toBe(0);
    expect(__mockDisparar).toHaveBeenCalledWith({
      tenantId: 'tenant-a',
      reservationId: 'res-1',
      evento: 'resena',
    });
    expect(__mockPrisma.auditLog.create).toHaveBeenCalledTimes(1);
    expect(__mockPrisma.auditLog.create.mock.calls[0][0].data).toMatchObject({
      accion: 'hospitality_review_request',
      entidad: 'reservation',
      entidadId: 'res-1',
    });
  });

  it('no pide la reseña dos veces (guard existente)', async () => {
    __mockPrisma.hospitalityReservation.findMany.mockResolvedValue([reservation()]);
    __mockPrisma.hospitalityCommunicationTemplate.findMany.mockResolvedValue([
      { tenantId: 'tenant-a' },
    ]);
    __mockPrisma.auditLog.findFirst.mockResolvedValue({ id: 'log-previo' });

    const r = await runHospitalityReviewRequestScan(24, 72);

    expect(r.enviados).toBe(0);
    expect(r.skipped).toBe(1);
    expect(__mockDisparar).not.toHaveBeenCalled();
    expect(__mockPrisma.auditLog.create).not.toHaveBeenCalled();
  });

  it('tenant sin plantilla resena activa: se omite sin consultar el guard', async () => {
    __mockPrisma.hospitalityReservation.findMany.mockResolvedValue([reservation()]);
    __mockPrisma.hospitalityCommunicationTemplate.findMany.mockResolvedValue([]);

    const r = await runHospitalityReviewRequestScan(24, 72);

    expect(r.skipped).toBe(1);
    expect(__mockPrisma.auditLog.findFirst).not.toHaveBeenCalled();
    expect(__mockDisparar).not.toHaveBeenCalled();
  });

  it('si el envío falla NO deja guard, para reintentar en el siguiente ciclo', async () => {
    __mockPrisma.hospitalityReservation.findMany.mockResolvedValue([reservation()]);
    __mockPrisma.hospitalityCommunicationTemplate.findMany.mockResolvedValue([
      { tenantId: 'tenant-a' },
    ]);
    __mockDisparar.mockResolvedValue([
      { templateId: 't1', evento: 'resena', canal: 'whatsapp', ok: false, error: 'Evolution 502' },
    ]);

    const r = await runHospitalityReviewRequestScan(24, 72);

    expect(r.enviados).toBe(0);
    expect(r.fallidos).toBe(1);
    expect(__mockPrisma.auditLog.create).not.toHaveBeenCalled();
  });
});
