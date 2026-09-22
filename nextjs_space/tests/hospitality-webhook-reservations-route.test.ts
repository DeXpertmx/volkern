// @vitest-environment node

/**
 * Guardia del contrato HTTP del webhook de reservas
 * (docs/hospitality-connectivity-contract.md, «Ciclo completo de un no_show
 * entrante»): qué código y qué body recibe el proveedor en cada caso, y la
 * regla de no-409 — la idempotencia se responde 200, nunca conflicto.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  getConnectivityCredentials: vi.fn(),
  updateConnectivityStatus: vi.fn(),
  processReservationWebhook: vi.fn(),
}));

vi.mock('@/lib/hospitality/connectivity', () => ({
  getConnectivityCredentials: mocks.getConnectivityCredentials,
  updateConnectivityStatus: mocks.updateConnectivityStatus,
  getConnectivityPublic: vi.fn().mockResolvedValue({ estado: 'conectado' }),
}));

vi.mock('@/lib/hospitality/reservations', () => ({
  processReservationWebhook: mocks.processReservationWebhook,
}));

const { POST, GET } = await import('@/app/api/hospitality/webhook/reservations/route');

const CREDS = { username: 'pms', password: 'secreto' };
const basic = (u = CREDS.username, p = CREDS.password) =>
  new Request('https://x/api/hospitality/webhook/reservations', {
    method: 'POST',
    headers: { authorization: `Basic ${Buffer.from(`${u}:${p}`).toString('base64')}` },
  }) as any;

const payloadOk = {
  action: 'no_show',
  hotelCode: 'sandbox-pms',
  channel: 'Directa',
  bookingId: 'BKG-1',
  checkin: '2026-09-18',
  checkout: '2026-09-20',
  rooms: [{ roomCode: 'suite', occupancy: { adults: 2 } }],
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getConnectivityCredentials.mockResolvedValue(CREDS);
  mocks.updateConnectivityStatus.mockResolvedValue(undefined);
});

describe('POST /api/hospitality/webhook/reservations — contrato HTTP', () => {
  it('sin credenciales configuradas → 503 (el proveedor reintenta con backoff)', async () => {
    mocks.getConnectivityCredentials.mockResolvedValue(null);
    const req = new Request('https://x', { method: 'POST' }) as any;
    const res = await POST(req);
    expect(res.status).toBe(503);
    // La política de reintentos viaja en el propio HTTP (contrato).
    expect(res.headers.get('retry-after')).toBe('60');
  });

  it('credenciales incorrectas → 401 (no reintentar)', async () => {
    const res = await POST(basic('pms', 'otra'));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  it('no_show aplicado → 200 con la penalización que calculó el motor', async () => {
    mocks.processReservationWebhook.mockResolvedValue({
      ok: true,
      status: 'actualizada',
      reservationId: 'r1',
      penalizacion: { emitida: true, importe: 500, motivo: null },
    });

    const req = basic();
    (req as any).json = async () => payloadOk;
    const res = await POST(req);

    // La guardia del contrato: 200 (no 409) y el cargo visible en la respuesta.
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.status).toBe('actualizada');
    expect(body.penalizacion).toEqual({ emitida: true, importe: 500, motivo: null });
  });

  it('no_show repetido → 200 idempotente con penalizacion null (nunca 409)', async () => {
    mocks.processReservationWebhook.mockResolvedValue({
      ok: true,
      status: 'actualizada',
      reservationId: 'r1',
      penalizacion: null,
    });

    const req = basic();
    (req as any).json = async () => payloadOk;
    const res = await POST(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.penalizacion).toBeNull();
  });

  it('reserva inexistente → 404 (el proveedor reintenta con backoff limitado)', async () => {
    mocks.processReservationWebhook.mockResolvedValue({
      ok: false,
      status: 'no_encontrada',
      error: 'Reserva no encontrada para marcar no_show',
    });

    const req = basic();
    (req as any).json = async () => payloadOk;
    const res = await POST(req);

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toContain('no_show');
    // 404 es reintentable con backoff limitado: la cabecera fija el mínimo.
    expect(res.headers.get('retry-after')).toBe('300');
  });

  it('error interno → 500 con Retry-After (transitorio, el ciclo es idempotente)', async () => {
    mocks.processReservationWebhook.mockRejectedValue(new Error('boom'));

    const req = basic();
    (req as any).json = async () => payloadOk;
    const res = await POST(req);

    expect(res.status).toBe(500);
    expect(res.headers.get('retry-after')).toBe('60');
  });

  it('error de proceso (payload inválido) → 400 (no reintentar)', async () => {
    mocks.processReservationWebhook.mockResolvedValue({
      ok: false,
      status: 'error',
      error: 'Acción no soportada: reenviar',
    });

    const req = basic();
    (req as any).json = async () => ({ ...payloadOk, action: 'reenviar' });
    const res = await POST(req);
    expect(res.status).toBe(400);
    // No reintentable: sin cabecera de reintento (su ausencia es contrato).
    expect(res.headers.get('retry-after')).toBeNull();
  });

  it('el 200 y el 401 no llevan Retry-After (no son reintentables)', async () => {
    mocks.processReservationWebhook.mockResolvedValue({
      ok: true,
      status: 'actualizada',
      reservationId: 'r1',
      penalizacion: null,
    });
    const reqOk = basic();
    (reqOk as any).json = async () => payloadOk;
    const resOk = await POST(reqOk);
    expect(resOk.status).toBe(200);
    expect(resOk.headers.get('retry-after')).toBeNull();

    const resAuth = await POST(basic('pms', 'otra'));
    expect(resAuth.status).toBe(401);
    expect(resAuth.headers.get('retry-after')).toBeNull();
  });

  it('JSON inválido → 400 sin llegar al motor', async () => {
    const req = basic();
    (req as any).json = async () => {
      throw new Error('bad json');
    };
    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(mocks.processReservationWebhook).not.toHaveBeenCalled();
  });

  it('GET informativo no filtra secretos', async () => {
    const res = await GET();
    const body = await res.json();
    expect(body.endpoint).toBe('webhook-reservas');
    expect(JSON.stringify(body)).not.toContain('secreto');
  });
});
