// @vitest-environment node

/**
 * Guardia del contrato HTTP del webhook de reservas
 * (docs/hospitality-connectivity-contract.md, «Ciclo completo de un no_show
 * entrante»): qué código y qué body recibe el proveedor en cada caso, y la
 * regla de no-409 — la idempotencia se responde 200, nunca conflicto.
 *
 * La autenticación es el par Basic de plataforma: el ID de socio es de cada
 * hotel y aquí no participa (el hotel se resuelve por el mapeo), así que quitarlo
 * del panel de plataforma no puede dejar el webhook sin credenciales.
 *
 * El 401 se comprueba además por su **diagnóstico**: motivo, esquema y huellas
 * de lo recibido — comparable entre las dos partes y sin transportar el valor.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const mocks = vi.hoisted(() => ({
  getConnectivityBasicAuth: vi.fn(),
  updateConnectivityStatus: vi.fn(),
  processReservationWebhook: vi.fn(),
}));

vi.mock('@/lib/hospitality/connectivity', () => ({
  getConnectivityBasicAuth: mocks.getConnectivityBasicAuth,
  updateConnectivityStatus: mocks.updateConnectivityStatus,
  getConnectivityPublic: vi.fn().mockResolvedValue({ estado: 'conectado' }),
}));

vi.mock('@/lib/hospitality/reservations', () => ({
  processReservationWebhook: mocks.processReservationWebhook,
}));

const { POST, GET } = await import('@/app/api/hospitality/webhook/reservations/route');

const CREDS = { username: 'pms', password: 'secreto' };
const basic = (u = CREDS.username, p = CREDS.password, esquema = 'Basic') =>
  new Request('https://x/api/hospitality/webhook/reservations', {
    method: 'POST',
    headers: { authorization: `${esquema} ${Buffer.from(`${u}:${p}`).toString('base64')}` },
  }) as any;

const conCuerpo = (req: any, cuerpo: unknown) => {
  (req as any).json = async () => cuerpo;
  return req;
};

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
  mocks.getConnectivityBasicAuth.mockResolvedValue(CREDS);
  mocks.updateConnectivityStatus.mockResolvedValue(undefined);
});

describe('POST /api/hospitality/webhook/reservations — contrato HTTP', () => {
  it('sin par Basic configurado → 503 (el proveedor reintenta con backoff)', async () => {
    mocks.getConnectivityBasicAuth.mockResolvedValue(null);
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

  it('el 401 explica el motivo sin revelar ningún secreto', async () => {
    const res = await POST(basic('pms', 'otra'));
    const body = await res.json();
    expect(body.diagnostico.motivo).toBe('credenciales_no_coinciden');
    expect(body.diagnostico.esquema).toBe('basic');
    expect(body.diagnostico.usuarioLen).toBe(3);
    expect(body.diagnostico.passwordLen).toBe(4);
    // Huellas comparables por el emisor, irreversibles: ni el par recibido ni
    // el guardado aparecen en la respuesta.
    expect(body.diagnostico.huella).toMatch(/^[0-9a-f]{12}$/);
    expect(body.diagnostico.usuarioHuella).toMatch(/^[0-9a-f]{12}$/);
    const crudo = JSON.stringify(body);
    expect(crudo).not.toContain('otra');
    expect(crudo).not.toContain(CREDS.password);
  });

  it('la huella del 401 es determinista y distingue pares (comparación entre las dos partes)', async () => {
    const igual1 = (await (await POST(basic('pms', 'otra'))).json()).diagnostico.huella;
    const igual2 = (await (await POST(basic('pms', 'otra'))).json()).diagnostico.huella;
    const distinta = (await (await POST(basic('pms', 'tercera'))).json()).diagnostico.huella;
    expect(igual1).toBe(igual2);
    expect(igual1).not.toBe(distinta);
  });

  it('sin cabecera → 401 con motivo sin_cabecera', async () => {
    const res = await POST(new Request('https://x', { method: 'POST' }) as any);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.diagnostico.motivo).toBe('sin_cabecera');
    expect(body.diagnostico.esquema).toBeNull();
  });

  it('otro esquema → 401 nombrando el esquema recibido, sin confundirlo con credenciales malas', async () => {
    const req = new Request('https://x', {
      method: 'POST',
      headers: { authorization: 'Bearer abc.def.ghi' },
    }) as any;
    const res = await POST(req);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.diagnostico.motivo).toBe('esquema_no_basic');
    expect(body.diagnostico.esquema).toBe('bearer');
  });

  it('esquema en minúsculas o con espacios de más se acepta (RFC 7235)', async () => {
    mocks.processReservationWebhook.mockResolvedValue({
      ok: true,
      status: 'actualizada',
      reservationId: 'r1',
      penalizacion: null,
    });
    const res = await POST(conCuerpo(basic(CREDS.username, CREDS.password, 'basic'), payloadOk));
    expect(res.status).toBe(200);

    const conEspacios = new Request('https://x', {
      method: 'POST',
      headers: {
        authorization: `Basic   ${Buffer.from('pms:secreto').toString('base64')}`,
      },
    }) as any;
    const resEspacios = await POST(conCuerpo(conEspacios, payloadOk));
    expect(resEspacios.status).toBe(200);
  });

  it('base64 sin separador → 401 con motivo sin_separador (no «credenciales incorrectas»)', async () => {
    const req = new Request('https://x', {
      method: 'POST',
      headers: { authorization: `Basic ${Buffer.from('sinDosPuntos').toString('base64')}` },
    }) as any;
    const res = await POST(req);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.diagnostico.motivo).toBe('sin_separador');
  });

  it('credencial con bytes no UTF-8 → 401 con motivo encoding_no_utf8', async () => {
    const req = new Request('https://x', {
      method: 'POST',
      headers: { authorization: `Basic ${Buffer.from([0xff, 0xfe, 0x3a, 0x61]).toString('base64')}` },
    }) as any;
    const res = await POST(req);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.diagnostico.motivo).toBe('encoding_no_utf8');
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

  it('el rechazo por credenciales también queda en el estado (contador de errores + registro del rechazo)', async () => {
    await POST(basic('pms', 'otra'));
    expect(mocks.updateConnectivityStatus).toHaveBeenCalledWith({
      estado: 'error',
      error: true,
      registroRechazo: {
        motivo: 'credenciales_no_coinciden',
        esquema: 'basic',
        usuarioLen: 3,
        passwordLen: 4,
        usuarioHuella: expect.stringMatching(/^[0-9a-f]{12}$/),
        huella: expect.stringMatching(/^[0-9a-f]{12}$/),
      },
    });
  });

  it('el rechazo por cabecera ausente se persiste con su motivo (panel sin logs del servicio)', async () => {
    await POST(new Request('https://x', { method: 'POST' }) as any);
    expect(mocks.updateConnectivityStatus).toHaveBeenCalledWith({
      estado: 'error',
      error: true,
      registroRechazo: { motivo: 'sin_cabecera', esquema: null },
    });
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

  it('el par Basic basta aunque la plataforma NO tenga ID de socio propio (el hotel sale del mapeo)', async () => {
    // El ID de socio es de cada hotel: la plataforma puede no tener el suyo y
    // aun así el webhook tiene que funcionar. Antes, exigir el ID de socio para
    // autenticar dejaba en 503 las reservas de TODOS los hoteles.
    mocks.getConnectivityBasicAuth.mockResolvedValue({ username: 'pms', password: 'secreto' });
    mocks.processReservationWebhook.mockResolvedValue({
      ok: true,
      status: 'creada',
      reservationId: 'r9',
      penalizacion: null,
    });

    const res = await POST(conCuerpo(basic(), payloadOk));

    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);
    expect(mocks.getConnectivityBasicAuth).toHaveBeenCalled();
  });

  it('la ruta autentica con el par Basic y NO con la puerta saliente (guardia de fuente)', () => {
    // `getConnectivityCredentials` exige ID de socio (es la puerta de las
    // llamadas SALIENTES). Usarla aquí volvería a acoplar el webhook entrante a
    // un ID de socio de plataforma que puede no existir a propósito.
    const fuente = fs.readFileSync(
      path.resolve(__dirname, '..', 'app/api/hospitality/webhook/reservations/route.ts'),
      'utf8'
    );
    expect(fuente).toContain('getConnectivityBasicAuth');
    expect(fuente).not.toContain('getConnectivityCredentials');
  });
});
