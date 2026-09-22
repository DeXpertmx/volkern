// @vitest-environment node
//
// Guardia del cron `hospitality_holds_expirados`
// (lib/cron/hospitality-holds.ts). El barrido cierra los holds `pending`
// olvidados: cancela (no produce nada), deja traza, emite la cancelación para
// automatizaciones, empuja inventario una vez por propiedad y avisa al
// operador con un resumen. Nunca toca un hold con pagos.

import { describe, it, expect, vi, beforeEach } from 'vitest';

const __mockPrisma = vi.hoisted(() => ({
  hospitalityReservation: {
    findMany: vi.fn(),
    updateMany: vi.fn(),
  },
  hospitalityProperty: {
    findMany: vi.fn(),
  },
  auditLog: {
    create: vi.fn(),
  },
}));

const __mockDispatch = vi.hoisted(() => vi.fn());
const __mockEmitCancelled = vi.hoisted(() => vi.fn());
const __mockOperadores = vi.hoisted(() => vi.fn());
const __mockPush = vi.hoisted(() => vi.fn());

vi.mock('@/lib/db', () => ({ prisma: __mockPrisma }));
vi.mock('@/lib/hospitality/sync', () => ({
  dispatchConnectivityPush: (...a: any[]) => __mockDispatch(...a),
}));
vi.mock('@/lib/hospitality/events', () => ({
  emitReservationCancelled: (...a: any[]) => __mockEmitCancelled(...a),
}));
vi.mock('@/lib/hospitality/incidencias', () => ({
  operadoresDelTenant: (...a: any[]) => __mockOperadores(...a),
}));
vi.mock('@/lib/services/push-notification', () => ({
  sendPushNotification: (...a: any[]) => __mockPush(...a),
}));

import { runHospitalityHoldExpiryScan } from '@/lib/cron/hospitality-holds';

const HORA = 60 * 60 * 1000;
const AHORA = new Date('2026-09-18T12:00:00');
const haceHoras = (horas: number) => new Date(AHORA.getTime() - horas * HORA);

function reserva(overrides: Record<string, any> = {}) {
  return {
    id: 'res-1',
    tenantId: 'tenant-a',
    propertyId: 'prop-1',
    unitId: 'unit-1',
    contactId: null,
    channel: 'Directa',
    externalBookingId: 'MAN-1',
    estado: 'pending',
    checkIn: haceHoras(10),
    checkOut: new Date(AHORA.getTime() + 48 * HORA),
    guestData: { firstName: 'Ana' },
    fechaCreacion: haceHoras(30),
    payments: [],
    ...overrides,
  };
}

function propiedad(overrides: Record<string, any> = {}) {
  return { id: 'prop-1', nombre: 'Villa Mar Azul', holdHoras: 24, ...overrides };
}

describe('Cron hospitality_holds_expirados', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __mockPrisma.hospitalityReservation.updateMany.mockResolvedValue({ count: 1 });
    __mockPrisma.hospitalityProperty.findMany.mockResolvedValue([propiedad()]);
    __mockPrisma.auditLog.create.mockResolvedValue({});
    __mockDispatch.mockResolvedValue({ ok: true });
    __mockOperadores.mockResolvedValue([{ id: 'u-1' }, { id: 'u-2' }]);
    __mockPush.mockResolvedValue({ success: true });
  });

  it('sin candidatos no toca nada', async () => {
    __mockPrisma.hospitalityReservation.findMany.mockResolvedValue([]);

    const r = await runHospitalityHoldExpiryScan(AHORA);

    expect(r).toEqual({
      total: 0,
      caducados: 0,
      omitidos: 0,
      sinCaducidad: 0,
      pushes: 0,
      errores: 0,
    });
    expect(__mockPrisma.hospitalityReservation.updateMany).not.toHaveBeenCalled();
    expect(__mockDispatch).not.toHaveBeenCalled();
    expect(__mockPush).not.toHaveBeenCalled();
  });

  it('caduca un pending que pasó la ventana: cancela, audita, emite, empuja y avisa', async () => {
    __mockPrisma.hospitalityReservation.findMany.mockResolvedValue([reserva()]);

    const r = await runHospitalityHoldExpiryScan(AHORA);

    expect(r.caducados).toBe(1);
    // La cancelación exige que siga en pending (seguro ante carreras).
    expect(__mockPrisma.hospitalityReservation.updateMany).toHaveBeenCalledWith({
      where: { id: 'res-1', estado: 'pending' },
      data: { estado: 'cancelled' },
    });
    expect(__mockPrisma.auditLog.create).toHaveBeenCalledTimes(1);
    const audit = __mockPrisma.auditLog.create.mock.calls[0][0].data;
    expect(audit.accion).toBe('hospitality_hold_expirado');
    expect(audit.entidadId).toBe('res-1');
    expect(audit.metadata.horasRetencion).toBe(24);
    expect(__mockEmitCancelled).toHaveBeenCalledTimes(1);
    expect(__mockEmitCancelled.mock.calls[0][0].estado).toBe('cancelled');
    // Inventario: una vez por propiedad.
    expect(__mockDispatch).toHaveBeenCalledTimes(1);
    expect(__mockDispatch).toHaveBeenCalledWith('tenant-a', 'prop-1', 'reserva_cancelada', {
      skipRates: true,
    });
    // Aviso: uno por operador, con el resumen.
    expect(__mockPush).toHaveBeenCalledTimes(2);
    const aviso = __mockPush.mock.calls[0][1];
    expect(aviso.title).toBe('Holds caducados liberados');
    expect(aviso.body).toContain('1 reserva pendiente');
    expect(aviso.body).toContain('Villa Mar Azul');
    expect(r.pushes).toBe(1);
  });

  it('un pending dentro de la ventana no se toca', async () => {
    __mockPrisma.hospitalityReservation.findMany.mockResolvedValue([
      reserva({ fechaCreacion: haceHoras(2) }),
    ]);

    const r = await runHospitalityHoldExpiryScan(AHORA);

    expect(r.caducados).toBe(0);
    expect(r.omitidos).toBe(1);
    expect(__mockPrisma.hospitalityReservation.updateMany).not.toHaveBeenCalled();
    expect(__mockPush).not.toHaveBeenCalled();
  });

  it('un hold CON PAGOS no caduca aunque sea viejo: es decisión humana', async () => {
    __mockPrisma.hospitalityReservation.findMany.mockResolvedValue([
      reserva({ fechaCreacion: haceHoras(200), payments: [{ id: 'pay-1' }] }),
    ]);

    const r = await runHospitalityHoldExpiryScan(AHORA);

    expect(r.caducados).toBe(0);
    expect(r.omitidos).toBe(1);
    expect(__mockPrisma.hospitalityReservation.updateMany).not.toHaveBeenCalled();
    expect(__mockDispatch).not.toHaveBeenCalled();
  });

  it('ventana 0 en la propiedad: sin caducidad, se cuenta aparte', async () => {
    __mockPrisma.hospitalityProperty.findMany.mockResolvedValue([
      propiedad({ holdHoras: 0 }),
    ]);
    __mockPrisma.hospitalityReservation.findMany.mockResolvedValue([
      reserva({ fechaCreacion: haceHoras(24 * 90) }),
    ]);

    const r = await runHospitalityHoldExpiryScan(AHORA);

    expect(r.caducados).toBe(0);
    expect(r.sinCaducidad).toBe(1);
    expect(__mockPrisma.hospitalityReservation.updateMany).not.toHaveBeenCalled();
  });

  it('carrera: si ya no está pending, no se pisa (count 0) ni se audita', async () => {
    __mockPrisma.hospitalityReservation.findMany.mockResolvedValue([reserva()]);
    __mockPrisma.hospitalityReservation.updateMany.mockResolvedValue({ count: 0 });

    const r = await runHospitalityHoldExpiryScan(AHORA);

    expect(r.caducados).toBe(0);
    expect(r.omitidos).toBe(1);
    expect(__mockPrisma.auditLog.create).not.toHaveBeenCalled();
    expect(__mockEmitCancelled).not.toHaveBeenCalled();
    expect(__mockDispatch).not.toHaveBeenCalled();
    expect(__mockPush).not.toHaveBeenCalled();
  });

  it('varios holds de la misma propiedad: un push de inventario y un resumen', async () => {
    __mockPrisma.hospitalityReservation.findMany.mockResolvedValue([
      reserva({ id: 'res-1' }),
      reserva({ id: 'res-2', externalBookingId: 'MAN-2' }),
    ]);

    const r = await runHospitalityHoldExpiryScan(AHORA);

    expect(r.caducados).toBe(2);
    expect(__mockPrisma.auditLog.create).toHaveBeenCalledTimes(2);
    // Una sola llamada por propiedad, no una por reserva.
    expect(__mockDispatch).toHaveBeenCalledTimes(1);
    expect(r.pushes).toBe(1);
    const aviso = __mockPush.mock.calls[0][1];
    expect(aviso.body).toContain('2 reservas pendientes');
  });

  it('propiedades de tenants distintos: un aviso por tenant', async () => {
    __mockPrisma.hospitalityReservation.findMany.mockResolvedValue([
      reserva({ id: 'res-1', propertyId: 'prop-1', tenantId: 'tenant-a' }),
      reserva({ id: 'res-2', propertyId: 'prop-2', tenantId: 'tenant-b' }),
    ]);
    __mockPrisma.hospitalityProperty.findMany.mockResolvedValue([
      propiedad({ id: 'prop-1' }),
      propiedad({ id: 'prop-2', nombre: 'Loft Centro' }),
    ]);

    const r = await runHospitalityHoldExpiryScan(AHORA);

    expect(r.caducados).toBe(2);
    expect(__mockDispatch).toHaveBeenCalledTimes(2);
    // Los dos tenants tienen 2 operadores cada uno en el mock.
    expect(__mockPush).toHaveBeenCalledTimes(4);
    expect(__mockPush.mock.calls[0][1].body).toContain('Villa Mar Azul');
    expect(__mockPush.mock.calls[2][1].body).toContain('Loft Centro');
  });

  it('un fallo del push de inventario no rompe el barrido', async () => {
    __mockPrisma.hospitalityReservation.findMany.mockResolvedValue([reserva()]);
    __mockDispatch.mockRejectedValue(new Error('sin conectividad'));

    const r = await runHospitalityHoldExpiryScan(AHORA);

    expect(r.caducados).toBe(1);
    expect(r.pushes).toBe(0);
    expect(r.errores).toBe(0);
    expect(__mockPrisma.auditLog.create).toHaveBeenCalledTimes(1);
  });

  it('un fallo del aviso no rompe el barrido', async () => {
    __mockPrisma.hospitalityReservation.findMany.mockResolvedValue([reserva()]);
    __mockOperadores.mockRejectedValue(new Error('sin operadores'));

    const r = await runHospitalityHoldExpiryScan(AHORA);

    expect(r.caducados).toBe(1);
    expect(r.errores).toBe(0);
  });

  it('la ventana la decide la propiedad, no un valor global', async () => {
    // Ventana de 2 h: un hold de 3 h ya caducó aunque el defecto sean 24.
    __mockPrisma.hospitalityProperty.findMany.mockResolvedValue([
      propiedad({ holdHoras: 2 }),
    ]);
    __mockPrisma.hospitalityReservation.findMany.mockResolvedValue([
      reserva({ fechaCreacion: haceHoras(3) }),
    ]);

    const r = await runHospitalityHoldExpiryScan(AHORA);

    expect(r.caducados).toBe(1);
    expect(__mockPrisma.auditLog.create.mock.calls[0][0].data.metadata.horasRetencion).toBe(2);
  });
});
