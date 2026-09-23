// @vitest-environment node

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks (hoisted) ─────────────────────────────────────────────────────────
const mocks = vi.hoisted(() => ({
  hospitalityWebhookEvent: { findUnique: vi.fn(), update: vi.fn() },
  hospitalityProperty: { findMany: vi.fn() },
  hospitalityReservation: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn() },
  hospitalityUnit: { findMany: vi.fn() },
  logAuditAction: vi.fn(),
  registrarReservaPartida: vi.fn(),
  externalIdDeParte: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ prisma: mocks }));
vi.mock('@/lib/permissions', () => ({ logAuditAction: mocks.logAuditAction }));
vi.mock('@/lib/hospitality/reservations', () => ({
  registrarReservaPartida: mocks.registrarReservaPartida,
  externalIdDeParte: (b: string, i: number) => `${b}#${i + 1}`,
  processCancel: vi.fn(),
  processReservationWebhook: vi.fn(),
  resolveMappingDetailed: vi.fn(),
}));

// authenticateRequest se define aparte para poder cambiarlo por test.
const mocksAuth = vi.hoisted(() => ({ authenticateRequest: vi.fn() }));
vi.mock('@/lib/api-key-auth', () => mocksAuth);

const { POST } = await import('@/app/api/hospitality/incidencias/registrar-partida/route');

function req(body: unknown): any {
  return {
    json: async () => body,
    headers: { get: () => null },
  };
}

const EVENTO = {
  id: 'ev_1',
  estado: 'sin_mapping',
  hotelCode: 'sandbox-pms',
  bookingId: 'BKG-MULTI',
  payload: {
    action: 'book',
    hotelCode: 'sandbox-pms',
    channel: 'airbnb',
    bookingId: 'BKG-MULTI',
    checkin: '2026-10-10',
    checkout: '2026-10-15',
    rooms: [
      { roomCode: 'suite', occupancy: { adults: 2, children: 0 } },
      { roomCode: 'executive', occupancy: { adults: 1, children: 1 } },
    ],
  },
};

describe('POST /api/hospitality/incidencias/registrar-partida', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocksAuth.authenticateRequest.mockResolvedValue({
      valid: true,
      tenant: { id: 't1' },
      user: { id: 'u1', role: { id: 'role_test', nombre: 'Superadmin', permisos: { all: true } } },
    });
    mocks.hospitalityWebhookEvent.findUnique.mockResolvedValue(EVENTO);
    mocks.hospitalityWebhookEvent.update.mockResolvedValue({});
    mocks.hospitalityProperty.findMany.mockResolvedValue([{ id: 'p1' }]);
    mocks.hospitalityReservation.findMany.mockResolvedValue([]); // partes ya registradas
    mocks.logAuditAction.mockResolvedValue(undefined);
    mocks.registrarReservaPartida.mockResolvedValue({
      ok: true,
      reservationIds: ['r1', 'r2'],
      habitaciones: [
        { indice: 0, roomCode: 'suite', externalBookingId: 'BKG-MULTI#1', estado: 'creada', reservationId: 'r1' },
        { indice: 1, roomCode: 'executive', externalBookingId: 'BKG-MULTI#2', estado: 'creada', reservationId: 'r2' },
      ],
    });
  });

  it('sin sesión → 401', async () => {
    mocksAuth.authenticateRequest.mockResolvedValue({ valid: false, error: 'No autorizado' });
    const res = await POST(req({ eventoId: 'ev_1', unidades: [{ indice: 0, unitId: 'u1' }] }));
    expect(res.status).toBe(401);
  });

  it('faltan campos → 400', async () => {
    const res1 = await POST(req({ unidades: [{ indice: 0, unitId: 'u1' }] }));
    const res2 = await POST(req({ eventoId: 'ev_1' }));
    expect(res1.status).toBe(400);
    expect(res2.status).toBe(400);
  });

  it('evento inexistente → 404', async () => {
    mocks.hospitalityWebhookEvent.findUnique.mockResolvedValue(null);
    const res = await POST(req({ eventoId: 'nope', unidades: [{ indice: 0, unitId: 'u1' }] }));
    expect(res.status).toBe(404);
  });

  it('evento ya procesado → 409', async () => {
    mocks.hospitalityWebhookEvent.findUnique.mockResolvedValue({ ...EVENTO, estado: 'procesado' });
    const res = await POST(req({ eventoId: 'ev_1', unidades: [{ indice: 0, unitId: 'u1' }] }));
    expect(res.status).toBe(409);
  });

  it('evento de otro tenant → 404 sin tocar nada', async () => {
    mocks.hospitalityProperty.findMany.mockResolvedValue([]);
    const res = await POST(req({ eventoId: 'ev_1', unidades: [{ indice: 0, unitId: 'u1' }] }));
    expect(res.status).toBe(404);
    expect(mocks.registrarReservaPartida).not.toHaveBeenCalled();
  });

  it('payload de una sola habitación → 409', async () => {
    mocks.hospitalityWebhookEvent.findUnique.mockResolvedValue({
      ...EVENTO,
      payload: { ...EVENTO.payload, rooms: [EVENTO.payload.rooms[0]] },
    });
    const res = await POST(req({ eventoId: 'ev_1', unidades: [{ indice: 0, unitId: 'u1' }] }));
    expect(res.status).toBe(409);
  });

  it('camino feliz: registra con el tenant de la petición y cierra el evento cuando todas las partes existen', async () => {
    // Las dos partes derivadas existen tras el registro → evento procesado.
    mocks.hospitalityReservation.findMany.mockResolvedValue([{ id: 'r1' }, { id: 'r2' }]);

    const res = await POST(
      req({
        eventoId: 'ev_1',
        unidades: [
          { indice: 0, unitId: 'u1' },
          { indice: 1, unitId: 'u2' },
        ],
      })
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.eventoCerrado).toBe(true);
    expect(mocks.registrarReservaPartida).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 't1', unidades: [{ indice: 0, unitId: 'u1' }, { indice: 1, unitId: 'u2' }] })
    );
    expect(mocks.hospitalityWebhookEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'ev_1' }, data: { estado: 'procesado' } })
    );
    expect(mocks.logAuditAction).toHaveBeenCalledTimes(1);
  });

  it('si quedan partes por registrar el evento sigue abierto', async () => {
    // Solo la parte #1 existe: el evento NO se cierra.
    mocks.hospitalityReservation.findMany.mockResolvedValue([{ id: 'r1' }]);

    const res = await POST(
      req({ eventoId: 'ev_1', unidades: [{ indice: 0, unitId: 'u1' }] })
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.eventoCerrado).toBe(false);
    expect(mocks.hospitalityWebhookEvent.update).not.toHaveBeenCalled();
  });

  it('la lib rechaza la elección (misma unidad) → 409 con el motivo', async () => {
    mocks.registrarReservaPartida.mockResolvedValue({
      ok: false,
      error: 'Dos habitaciones apuntan a la misma unidad: elige una unidad distinta para cada una.',
    });
    const res = await POST(
      req({
        eventoId: 'ev_1',
        unidades: [
          { indice: 0, unitId: 'u1' },
          { indice: 1, unitId: 'u1' },
        ],
      })
    );
    expect(res.status).toBe(409);
    const data = await res.json();
    expect(data.error).toContain('misma unidad');
    expect(mocks.hospitalityWebhookEvent.update).not.toHaveBeenCalled();
  });
});
