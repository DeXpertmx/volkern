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
      checkIn: new Date('2026-09-20T15:00:00Z'),
      checkOut: new Date('2026-09-24T11:00:00Z'),
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
    const res = await POST(reqPost({ reservationId: 'r1', syncLogId: 'log1' }));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.estado).toBe('cancelled');

    // Re-verificación contra el proveedor con el rango de la reserva. El tenant
    // viaja en la llamada porque el ID de socio con el que se consulta puede ser
    // el del cliente, no el de plataforma.
    expect(mocks.fetchReservations).toHaveBeenCalledWith('HOTEL-1', '2026-09-20', '2026-09-24', 't1');
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
