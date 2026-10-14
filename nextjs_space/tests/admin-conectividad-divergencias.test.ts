// @vitest-environment node

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks (hoisted) ─────────────────────────────────────────────────────────
const mocks = vi.hoisted(() => ({
  user: { findUnique: vi.fn() },
  hospitalitySyncLog: { findMany: vi.fn(), findUnique: vi.fn() },
  hospitalityReservation: { findMany: vi.fn(), findFirst: vi.fn() },
  connectivityMapping: { findFirst: vi.fn() },
  fetchReservations: vi.fn(),
  processCancel: vi.fn(),
  logAuditAction: vi.fn(),
  notify: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ default: mocks, prisma: mocks }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('next-auth', () => ({ getServerSession: vi.fn() }));
vi.mock('@/lib/hospitality/connectivity', () => ({
  fetchReservations: (...a: unknown[]) => mocks.fetchReservations(...a),
}));
vi.mock('@/lib/hospitality/reservations', () => ({
  processCancel: (...a: unknown[]) => mocks.processCancel(...a),
}));
vi.mock('@/lib/permissions', () => ({
  logAuditAction: (...a: unknown[]) => mocks.logAuditAction(...a),
}));
vi.mock('@/lib/telegram/developer-notify', () => ({
  notifyDeveloperSensitiveAction: (...a: unknown[]) => mocks.notify(...a),
}));

const { getServerSession } = await import('next-auth');
const { GET, POST } = await import('@/app/api/admin/conectividad/divergencias/route');

function reqPost(body: unknown): any {
  return {
    json: async () => body,
    headers: { get: () => null },
  };
}

const AUSENTE = {
  reservationId: 'r1',
  externalBookingId: 'BKG-77',
  channel: 'airbnb',
  estado: 'confirmed',
  checkIn: '2026-09-20',
  checkOut: '2026-09-24',
  unidad: 'Suite Ática',
  huespedes: 2,
};

function logInventario(
  id: string,
  body: Record<string, unknown>,
  propertyId: string | null = 'p1'
) {
  return {
    id,
    tenantId: 't1',
    propertyId,
    tipo: 'divergencias_inventario',
    fechaCreacion: new Date('2026-10-09T04:15:00Z'),
    tenant: { id: 't1', nombre: 'Hotel Demo' },
    property: { id: propertyId, nombre: 'Villa Mar Azul' },
    responseBody: body,
  };
}

function logConAusentes(id: string, ausentes: unknown[], propertyId: string | null = 'p1') {
  return {
    id,
    tenantId: 't1',
    propertyId,
    fechaCreacion: new Date('2026-09-15T04:15:00Z'),
    tenant: { id: 't1', nombre: 'Hotel Demo' },
    property: { id: propertyId, nombre: 'Villa Mar Azul' },
    responseBody: { divergencias: ausentes.length, ausentes },
  };
}

describe('GET /api/admin/conectividad/divergencias', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getServerSession as any).mockResolvedValue({ user: { id: 'u1' } });
    mocks.user.findUnique.mockResolvedValue({ id: 'u1', role: { nombre: 'Superadmin' } });
    mocks.hospitalitySyncLog.findMany.mockResolvedValue([]);
    mocks.hospitalityReservation.findMany.mockResolvedValue([]);
    mocks.notify.mockResolvedValue({});
  });

  it('sin sesión → 401 y no consulta logs', async () => {
    (getServerSession as any).mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
    expect(mocks.hospitalitySyncLog.findMany).not.toHaveBeenCalled();
  });

  it('rol distinto de Superadmin → 403', async () => {
    mocks.user.findUnique.mockResolvedValue({ id: 'u1', role: { nombre: 'Admin' } });
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it('proyecta las ausentes de los logs con el estado vivo de cada reserva', async () => {
    mocks.hospitalitySyncLog.findMany.mockResolvedValue([logConAusentes('log1', [AUSENTE])]);
    mocks.hospitalityReservation.findMany.mockResolvedValue([{ id: 'r1', estado: 'confirmed' }]);

    const res = await GET();
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.divergencias).toHaveLength(1);
    const d = data.divergencias[0];
    expect(d.reservationId).toBe('r1');
    expect(d.externalBookingId).toBe('BKG-77');
    expect(d.channel).toBe('airbnb');
    expect(d.unidad).toBe('Suite Ática');
    expect(d.propertyNombre).toBe('Villa Mar Azul');
    expect(d.estadoActual).toBe('confirmed');
    expect(d.reservaExiste).toBe(true);
    expect(d.syncLogId).toBe('log1');
  });

  it('cuenta en cuántos barridos apareció la misma reserva (agrupación por reserva)', async () => {
    mocks.hospitalitySyncLog.findMany.mockResolvedValue([
      logConAusentes('log2', [AUSENTE]),
      logConAusentes('log1', [AUSENTE]),
    ]);
    mocks.hospitalityReservation.findMany.mockResolvedValue([{ id: 'r1', estado: 'confirmed' }]);

    const res = await GET();
    const data = await res.json();

    expect(data.divergencias).toHaveLength(1);
    expect(data.divergencias[0].veces).toBe(2);
    // El syncLogId más reciente manda (el primero del findMany ordenado desc).
    expect(data.divergencias[0].syncLogId).toBe('log2');
  });

  it('sin logs con ausentes → lista vacía y no pregunta reservas', async () => {
    mocks.hospitalitySyncLog.findMany.mockResolvedValue([
      { id: 'log3', responseBody: { divergencias: 0 } },
    ]);
    const res = await GET();
    const data = await res.json();
    expect(data.divergencias).toEqual([]);
    expect(mocks.hospitalityReservation.findMany).not.toHaveBeenCalled();
  });

  it('devuelve el último barrido de noches sin justificar por propiedad', async () => {
    mocks.hospitalitySyncLog.findMany.mockResolvedValue([
      logInventario('inv2', {
        cerradasSinJustificar: 2,
        abiertasSinJustificar: 0,
        comparadas: 30,
        sinDato: 26,
        cerradas: [
          { roomCode: '2b', fecha: '2026-10-10', proveedor: 0, interno: 1, empujadoEn: null },
          { roomCode: '2b', fecha: '2026-10-11', proveedor: 0, interno: 1, empujadoEn: null },
        ],
        abiertas: [],
      }),
      // Barrido anterior de la MISMA propiedad: no debe duplicar la fila.
      logInventario('inv1', {
        cerradasSinJustificar: 0,
        abiertasSinJustificar: 0,
        comparadas: 30,
        sinDato: 30,
        cerradas: [],
        abiertas: [],
      }),
      logConAusentes('log1', [AUSENTE]),
    ]);
    mocks.hospitalityReservation.findMany.mockResolvedValue([{ id: 'r1', estado: 'confirmed' }]);

    const res = await GET();
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.inventario).toHaveLength(1);
    const i = data.inventario[0];
    expect(i.syncLogId).toBe('inv2');
    expect(i.propertyNombre).toBe('Villa Mar Azul');
    expect(i.cerradasSinJustificar).toBe(2);
    expect(i.sinDato).toBe(26);
    expect(i.cerradas).toHaveLength(2);
    expect(i.cerradas[0]).toMatchObject({ roomCode: '2b', proveedor: 0, interno: 1 });
  });

  it('lista el barrido aunque no haya reservas divergentes (y viceversa)', async () => {
    mocks.hospitalitySyncLog.findMany.mockResolvedValue([
      logInventario('inv1', {
        cerradasSinJustificar: 1,
        abiertasSinJustificar: 1,
        comparadas: 30,
        sinDato: 28,
        cerradas: [],
        abiertas: [],
      }),
    ]);

    const res = await GET();
    const data = await res.json();

    expect(data.divergencias).toEqual([]);
    expect(data.inventario).toHaveLength(1);
    expect(data.inventario[0].abiertasSinJustificar).toBe(1);
  });

  it('un log de reconciliación sin contadores no se interpreta como barrido', async () => {
    mocks.hospitalitySyncLog.findMany.mockResolvedValue([logConAusentes('log1', [AUSENTE])]);
    mocks.hospitalityReservation.findMany.mockResolvedValue([{ id: 'r1', estado: 'confirmed' }]);

    const res = await GET();
    const data = await res.json();

    expect(data.divergencias).toHaveLength(1);
    expect(data.inventario).toEqual([]);
  });

  it('ignora entradas de ausentes malformadas en el log', async () => {
    mocks.hospitalitySyncLog.findMany.mockResolvedValue([
      logConAusentes('log1', [{ reservationId: 'solo-id' }, null, 'texto', AUSENTE]),
    ]);
    mocks.hospitalityReservation.findMany.mockResolvedValue([{ id: 'r1', estado: 'confirmed' }]);

    const res = await GET();
    const data = await res.json();
    expect(data.divergencias).toHaveLength(1);
    expect(data.divergencias[0].reservationId).toBe('r1');
  });
});

describe('POST /api/admin/conectividad/divergencias (cancelar reserva revisada)', () => {
  const LOG = {
    id: 'log1',
    tenantId: 't1',
    propertyId: 'p1',
    responseBody: { divergencias: 1, ausentes: [AUSENTE] },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (getServerSession as any).mockResolvedValue({ user: { id: 'u1' } });
    mocks.user.findUnique.mockResolvedValue({ id: 'u1', role: { nombre: 'Superadmin' } });
    mocks.hospitalitySyncLog.findUnique.mockResolvedValue(LOG);
    mocks.hospitalityReservation.findFirst.mockResolvedValue({
      id: 'r1',
      estado: 'confirmed',
      // Reserva hecha en enero para una estancia de septiembre: la ventana de
      // re-verificación tiene que cubrir CUÁNDO SE HIZO, no cuándo es. Fechas
      // locales (no UTC) para que el cálculo no dependa de la zona horaria.
      bookedOn: new Date(2026, 0, 15, 10, 0, 0),
      fechaCreacion: new Date(2026, 0, 15, 10, 0, 1),
      channel: 'airbnb',
      externalBookingId: 'BKG-77',
    });
    mocks.connectivityMapping.findFirst.mockResolvedValue({ externalPropertyId: 'HOTEL-1' });
    mocks.fetchReservations.mockResolvedValue({ ok: true, reservas: [] });
    mocks.processCancel.mockResolvedValue({ ok: true, status: 'cancelada', reservationId: 'r1' });
    mocks.notify.mockResolvedValue({});
    mocks.logAuditAction.mockResolvedValue(undefined);
  });

  it('sin sesión → 401', async () => {
    (getServerSession as any).mockResolvedValue(null);
    const res = await POST(reqPost({ reservationId: 'r1', syncLogId: 'log1' }));
    expect(res.status).toBe(401);
  });

  it('faltan campos → 400', async () => {
    const res = await POST(reqPost({ reservationId: 'r1' }));
    expect(res.status).toBe(400);
  });

  it('log inexistente → 404', async () => {
    mocks.hospitalitySyncLog.findUnique.mockResolvedValue(null);
    const res = await POST(reqPost({ reservationId: 'r1', syncLogId: 'nope' }));
    expect(res.status).toBe(404);
  });

  it('la reserva ya no figura como ausente en el log → 409 sin cancelar', async () => {
    mocks.hospitalitySyncLog.findUnique.mockResolvedValue({
      ...LOG,
      responseBody: { divergencias: 0 },
    });
    const res = await POST(reqPost({ reservationId: 'r1', syncLogId: 'log1' }));
    expect(res.status).toBe(409);
    expect(mocks.processCancel).not.toHaveBeenCalled();
    expect(mocks.fetchReservations).not.toHaveBeenCalled();
  });

  it('la reserva ya no está activa → 409 sin cancelar', async () => {
    mocks.hospitalityReservation.findFirst.mockResolvedValue({ id: 'r1', estado: 'cancelled' });
    const res = await POST(reqPost({ reservationId: 'r1', syncLogId: 'log1' }));
    expect(res.status).toBe(409);
    expect(mocks.processCancel).not.toHaveBeenCalled();
  });

  it('si el proveedor vuelve a reportarla, NO cancela (ruido transitorio)', async () => {
    mocks.fetchReservations.mockResolvedValue({
      ok: true,
      reservas: [{ channel: 'airbnb', bookingId: 'BKG-77', action: 'book' }],
    });
    const res = await POST(reqPost({ reservationId: 'r1', syncLogId: 'log1' }));
    expect(res.status).toBe(409);
    const data = await res.json();
    expect(data.reaparece).toBe(true);
    expect(mocks.processCancel).not.toHaveBeenCalled();
  });

  it('un cancel explícito del proveedor en el re-fetch no cuenta como reaparición', async () => {
    mocks.fetchReservations.mockResolvedValue({
      ok: true,
      reservas: [{ channel: 'airbnb', bookingId: 'BKG-77', action: 'cancel' }],
    });
    const res = await POST(reqPost({ reservationId: 'r1', syncLogId: 'log1' }));
    expect(res.status).toBe(200);
    expect(mocks.processCancel).toHaveBeenCalledTimes(1);
  });

  it('sin mapping activo no se puede re-verificar → 409 sin cancelar', async () => {
    mocks.connectivityMapping.findFirst.mockResolvedValue(null);
    const res = await POST(reqPost({ reservationId: 'r1', syncLogId: 'log1' }));
    expect(res.status).toBe(409);
    expect(mocks.processCancel).not.toHaveBeenCalled();
  });

  it('camino feliz: re-verifica, cancela con el tenant del log, audita y notifica', async () => {
    // Reloj fijo: la ventana se calcula con el día de hoy.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 9, 12, 0, 0));
    let res: any;
    try {
      res = await POST(reqPost({ reservationId: 'r1', syncLogId: 'log1' }));
    } finally {
      vi.useRealTimers();
    }
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.estado).toBe('cancelled');

    // Re-verificación con la ventana de FECHAS DE RESERVA que cubre el
    // `bookedOn` de esta reserva, no con su rango de estancia: el proveedor
    // filtra por fecha de reserva. Y el barrido ya mira el horizonte de venta
    // (730 días), que es más profundo que ese `bookedOn` (15 ene 2026): manda el
    // más ancho de los dos, así que la ventana empieza el 9 oct 2024 y no el 14
    // ene 2026. El tenant viaja en la llamada porque el ID de socio con el que
    // se consulta puede ser el del cliente, no el de plataforma.
    expect(mocks.fetchReservations).toHaveBeenCalledWith('HOTEL-1', '2024-10-09', '2026-11-08', 't1');
    // La cancelación usa el tenant del LOG, no un tenant del cliente.
    expect(mocks.processCancel).toHaveBeenCalledWith(
      't1',
      expect.objectContaining({ channel: 'airbnb', bookingId: 'BKG-77', action: 'cancel' })
    );
    expect(mocks.logAuditAction).toHaveBeenCalledTimes(1);
    expect(mocks.notify).toHaveBeenCalledTimes(1);
  });

  it('si el fetch de re-verificación falla, la revisión humana manda y cancela', async () => {
    mocks.fetchReservations.mockResolvedValue({ ok: false, httpStatus: 502 });
    const res = await POST(reqPost({ reservationId: 'r1', syncLogId: 'log1' }));
    expect(res.status).toBe(200);
    expect(mocks.processCancel).toHaveBeenCalledTimes(1);
  });

  it('processCancel falla → 409 con el motivo', async () => {
    mocks.processCancel.mockResolvedValue({ ok: false, status: 'no_encontrada' });
    const res = await POST(reqPost({ reservationId: 'r1', syncLogId: 'log1' }));
    expect(res.status).toBe(409);
  });
});
