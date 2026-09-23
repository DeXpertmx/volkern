// @vitest-environment node

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  authenticateRequest: vi.fn(),
  hospitalityProperty: { findMany: vi.fn() },
  hospitalityWebhookEvent: { findMany: vi.fn() },
  processReservationWebhook: vi.fn(),
  resolveMappingDetailed: vi.fn(),
  processCancel: vi.fn(),
  logAuditAction: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ default: mocks, prisma: mocks }));
vi.mock('@/lib/api-key-auth', () => ({ authenticateRequest: mocks.authenticateRequest }));
vi.mock('@/lib/permissions', () => ({ logAuditAction: mocks.logAuditAction }));
vi.mock('@/lib/hospitality/reservations', () => ({
  processReservationWebhook: mocks.processReservationWebhook,
  resolveMappingDetailed: mocks.resolveMappingDetailed,
  processCancel: mocks.processCancel,
}));

const { POST } = await import('@/app/api/hospitality/incidencias/reintentar/route');

const PROPIEDAD = {
  id: 'p1',
  nombre: 'Villa Mar Azul',
  mappings: [
    { externalPropertyId: 'sandbox-pms', externalUnitCode: 'suite', estado: 'activo', unit: { id: 'u1', nombre: 'Suite Oceano' } },
  ],
};

/** Payload ya normalizado tal como lo reenviaría el webhook. */
const PAYLOAD = {
  action: 'book',
  hotelCode: 'sandbox-pms',
  channel: 'Airbnb',
  bookingId: 'BKG-1',
  checkin: '2026-10-10',
  checkout: '2026-10-15',
  rooms: [{ roomCode: 'suite', rateplanCode: 'suite-d-ep' }],
};

function evento(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ev_1',
    hotelCode: 'sandbox-pms',
    bookingId: 'BKG-1',
    channel: 'Airbnb',
    action: 'book',
    payload: PAYLOAD,
    ...overrides,
  };
}

function reqConBody(body: unknown) {
  return new Request('https://volkern.app/api/hospitality/incidencias/reintentar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as any;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.authenticateRequest.mockResolvedValue({ valid: true, tenant: { id: 't1' }, user: { id: 'u1', role: { id: 'role_test', nombre: 'Superadmin', permisos: { all: true } } } });
  mocks.hospitalityProperty.findMany.mockResolvedValue([PROPIEDAD]);
  mocks.hospitalityWebhookEvent.findMany.mockResolvedValue([evento()]);
  mocks.resolveMappingDetailed.mockResolvedValue({
    mapping: { property: { id: 'p1', tenantId: 't1' } },
    motivo: 'ok',
    roomCode: 'suite',
    rateplanCode: 'suite-d-ep',
  });
  mocks.processReservationWebhook.mockResolvedValue({
    ok: true,
    status: 'creada',
    reservationId: 'res_1',
  });
  mocks.logAuditAction.mockResolvedValue(undefined);
});

describe('POST /api/hospitality/incidencias/reintentar', () => {
  it('sin autenticación → 401', async () => {
    mocks.authenticateRequest.mockResolvedValue({ valid: false, error: 'API key no proporcionada' });
    const res = await POST(reqConBody({ eventoIds: ['ev_1'] }));
    expect(res.status).toBe(401);
  });

  it('sin eventos → 400', async () => {
    const res = await POST(reqConBody({ eventoIds: [] }));
    expect(res.status).toBe(400);
    expect(mocks.processReservationWebhook).not.toHaveBeenCalled();
  });

  it('reenvía el payload guardado y reporta la reserva registrada', async () => {
    const res = await POST(reqConBody({ eventoIds: ['ev_1'] }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.reenviadas).toBe(1);
    expect(body.resultados[0]).toMatchObject({
      eventoId: 'ev_1',
      bookingId: 'BKG-1',
      estado: 'registrada',
      reservationId: 'res_1',
    });

    // El reenvío pasa por el mismo motor de reservas (idempotente por bookingId).
    expect(mocks.processReservationWebhook).toHaveBeenCalledTimes(1);
    expect(mocks.processReservationWebhook.mock.calls[0][0]).toEqual(PAYLOAD);
    // Y queda traza en la auditoría.
    expect(mocks.logAuditAction).toHaveBeenCalled();
  });

  it('un booking ya registrado responde duplicado sin duplicar nada', async () => {
    mocks.processReservationWebhook.mockResolvedValue({
      ok: true,
      status: 'duplicado',
      reservationId: 'res_existente',
    });

    const res = await POST(reqConBody({ eventoIds: ['ev_1'] }));
    const body = await res.json();

    expect(body.reenviadas).toBe(0);
    expect(body.duplicadas).toBe(1);
    expect(body.resultados[0]).toMatchObject({ estado: 'duplicado', reservationId: 'res_existente' });
    expect(body.ok).toBe(true);
  });

  it('sin vínculo no reenvía nada y explica qué habitación falta', async () => {
    mocks.hospitalityWebhookEvent.findMany.mockResolvedValue([
      evento({ payload: { ...PAYLOAD, rooms: [{ roomCode: 'penthouse', rateplanCode: 'penthouse-ep' }] } }),
    ]);

    const res = await POST(reqConBody({ eventoIds: ['ev_1'] }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(false);
    expect(body.sinVinculo).toBe(1);
    expect(body.resultados[0].estado).toBe('sin_vinculo');
    expect(body.resultados[0].error).toContain('penthouse');
    expect(mocks.processReservationWebhook).not.toHaveBeenCalled();
  });

  it('reconoce el vínculo a nivel de propiedad cuando el payload no trae habitación', async () => {
    mocks.hospitalityProperty.findMany.mockResolvedValue([
      {
        id: 'p1',
        nombre: 'Villa Mar Azul',
        mappings: [
          { externalPropertyId: 'sandbox-pms', externalUnitCode: null, estado: 'activo', unit: { id: 'u1', nombre: 'Casa completa' } },
        ],
      },
    ]);
    mocks.hospitalityWebhookEvent.findMany.mockResolvedValue([
      evento({ payload: { ...PAYLOAD, rooms: [] } }),
    ]);

    const res = await POST(reqConBody({ eventoIds: ['ev_1'] }));
    const body = await res.json();

    expect(body.sinVinculo).toBe(0);
    expect(body.reenviadas).toBe(1);
    expect(mocks.processReservationWebhook).toHaveBeenCalled();
  });

  it('eventos de otro tenant → 404 y sin reenviar', async () => {
    mocks.hospitalityWebhookEvent.findMany.mockResolvedValue([
      evento({ hotelCode: 'hotel-ajeno' }),
    ]);

    const res = await POST(reqConBody({ eventoIds: ['ev_1'] }));

    expect(res.status).toBe(404);
    expect(mocks.processReservationWebhook).not.toHaveBeenCalled();
  });

  it('si la resolución apunta a otra propiedad del sistema, no reenvía', async () => {
    mocks.resolveMappingDetailed.mockResolvedValue({
      mapping: { property: { id: 'p_otro', tenantId: 't2' } },
      motivo: 'ok',
      roomCode: 'suite',
      rateplanCode: null,
    });

    const res = await POST(reqConBody({ eventoIds: ['ev_1'] }));
    const body = await res.json();

    expect(body.fallidas).toBe(1);
    expect(body.ok).toBe(false);
    expect(mocks.processReservationWebhook).not.toHaveBeenCalled();
  });

  it('reenvía una sola vez cada reserva aunque tenga varios eventos', async () => {
    mocks.hospitalityWebhookEvent.findMany.mockResolvedValue([
      evento({ id: 'ev_nuevo' }),
      evento({ id: 'ev_viejo' }),
    ]);

    const res = await POST(reqConBody({ eventoIds: ['ev_nuevo', 'ev_viejo'] }));
    const body = await res.json();

    expect(mocks.processReservationWebhook).toHaveBeenCalledTimes(1);
    expect(body.resultados).toHaveLength(1);
    expect(body.resultados[0].eventoId).toBe('ev_nuevo');
  });

  it('un error del motor de reservas se reporta sin tumbar la petición', async () => {
    mocks.processReservationWebhook.mockResolvedValue({
      ok: false,
      status: 'error',
      error: 'Sin mapping de unidad para hotelCode sandbox-pms y roomCode suite',
    });

    const res = await POST(reqConBody({ eventoIds: ['ev_1'] }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.fallidas).toBe(1);
    expect(body.resultados[0].estado).toBe('error');
    expect(body.resultados[0].error).toContain('Sin mapping');
  });

  it('limita el reenvío por petición', async () => {
    const muchos = Array.from({ length: 21 }, (_, i) => `ev_${i}`);
    const res = await POST(reqConBody({ eventoIds: muchos }));
    expect(res.status).toBe(400);
    expect(mocks.processReservationWebhook).not.toHaveBeenCalled();
  });

  it('un evento cancel va a processCancel aunque la habitación siga sin vínculo', async () => {
    // El cancel se aplica por bookingId: no depende del mapping de la unidad.
    mocks.hospitalityWebhookEvent.findMany.mockResolvedValue([
      evento({
        action: 'cancel',
        payload: { ...PAYLOAD, action: 'cancel', rooms: [{ roomCode: 'penthouse' }] },
      }),
    ]);
    mocks.processCancel.mockResolvedValue({
      ok: true,
      status: 'cancelada',
      reservationId: 'res_1',
    });

    const res = await POST(reqConBody({ eventoIds: ['ev_1'] }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.reenviadas).toBe(1);
    expect(body.resultados[0]).toMatchObject({ estado: 'cancelada', reservationId: 'res_1' });
    // La habitación 'penthouse' no está vinculada: no pasa por la guardia.
    expect(mocks.processCancel).toHaveBeenCalledTimes(1);
    expect(mocks.processCancel.mock.calls[0][0]).toBe('t1');
    expect(mocks.processCancel.mock.calls[0][1]).toMatchObject({ action: 'cancel', bookingId: 'BKG-1' });
    expect(mocks.processReservationWebhook).not.toHaveBeenCalled();
    expect(mocks.resolveMappingDetailed).not.toHaveBeenCalled();
  });

  it('un cancel cuya reserva no existe se reporta como error sin ensuciar nada', async () => {
    mocks.hospitalityWebhookEvent.findMany.mockResolvedValue([
      evento({ action: 'cancel', payload: { ...PAYLOAD, action: 'cancel' } }),
    ]);
    mocks.processCancel.mockResolvedValue({
      ok: false,
      status: 'no_encontrada',
      error: 'Reserva no encontrada para cancelar',
    });

    const res = await POST(reqConBody({ eventoIds: ['ev_1'] }));
    const body = await res.json();

    expect(body.reenviadas).toBe(0);
    expect(body.fallidas).toBe(1);
    expect(body.ok).toBe(false);
    expect(body.resultados[0].estado).toBe('error');
    expect(body.resultados[0].error).toContain('no encontrada');
  });

  it('book y modify conservan la guardia: sin vínculo no se reenvían', async () => {
    // Un modify sin registro previo CREARÍA la reserva, así que exige vínculo
    // exactamente igual que un book.
    mocks.hospitalityWebhookEvent.findMany.mockResolvedValue([
      evento({
        id: 'ev_book',
        action: 'book',
        payload: { ...PAYLOAD, rooms: [{ roomCode: 'penthouse' }] },
      }),
      evento({
        id: 'ev_modify',
        bookingId: 'BKG-2',
        action: 'modify',
        payload: { ...PAYLOAD, action: 'modify', bookingId: 'BKG-2', rooms: [{ roomCode: 'penthouse' }] },
      }),
    ]);

    const res = await POST(reqConBody({ eventoIds: ['ev_book', 'ev_modify'] }));
    const body = await res.json();

    expect(body.sinVinculo).toBe(2);
    expect(body.resultados.map((r: { estado: string }) => r.estado)).toEqual(['sin_vinculo', 'sin_vinculo']);
    expect(mocks.processReservationWebhook).not.toHaveBeenCalled();
    expect(mocks.processCancel).not.toHaveBeenCalled();
  });

  it('un modify con vínculo se reenvía por el motor normal', async () => {
    mocks.hospitalityWebhookEvent.findMany.mockResolvedValue([
      evento({ action: 'modify', payload: { ...PAYLOAD, action: 'modify' } }),
    ]);

    const res = await POST(reqConBody({ eventoIds: ['ev_1'] }));
    const body = await res.json();

    expect(body.reenviadas).toBe(1);
    expect(mocks.processReservationWebhook).toHaveBeenCalledTimes(1);
    expect(mocks.processReservationWebhook.mock.calls[0][0]).toMatchObject({ action: 'modify' });
  });
});
