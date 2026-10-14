// @vitest-environment node

/**
 * Guardia del contrato HTTP del webhook de MENSAJES del canal.
 *
 * Es el webhook que Aiosell llama cuando un huésped escribe en una OTA. Lo que
 * se fija aquí es qué recibe el proveedor en cada caso, porque de eso depende su
 * política de reintentos: 503 sin conectividad (reintenta), 401 con el mismo
 * diagnóstico que el webhook de reservas (no reintentar: es de configuración),
 * 404 sin mapping (reintentar: el mapping puede estar en camino), 400 con datos
 * que no se pueden representar (no reintentar) y 200 tanto al registrar como al
 * reconocer un duplicado.
 *
 * Y una regla de datos personales: el payload crudo del huésped NO se persiste
 * en la tabla de eventos del proveedor (lleva nombre, teléfono y email).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const mocks = vi.hoisted(() => ({
  getConnectivityBasicAuth: vi.fn(),
  updateConnectivityStatus: vi.fn(),
  registrarMensajeEntrante: vi.fn(),
  registrarIncidenciaMensajeSinMapping: vi.fn(),
}));

vi.mock('@/lib/hospitality/connectivity', () => ({
  getConnectivityBasicAuth: mocks.getConnectivityBasicAuth,
  updateConnectivityStatus: mocks.updateConnectivityStatus,
  getConnectivityPublic: vi.fn().mockResolvedValue({ estado: 'conectado' }),
}));

vi.mock('@/lib/hospitality/mensajes-service', () => ({
  registrarMensajeEntrante: mocks.registrarMensajeEntrante,
  registrarIncidenciaMensajeSinMapping: mocks.registrarIncidenciaMensajeSinMapping,
}));

const { POST, GET } = await import('@/app/api/hospitality/webhook/messages/route');

const CREDS = { username: 'pms', password: 'secreto' };
const basic = (u = CREDS.username, p = CREDS.password, esquema = 'Basic', url = 'https://x/api/hospitality/webhook/messages') =>
  new Request(url, {
    method: 'POST',
    headers: { authorization: `${esquema} ${Buffer.from(`${u}:${p}`).toString('base64')}` },
  }) as any;

const conCuerpo = (req: any, cuerpo: unknown) => {
  (req as any).json = async () => cuerpo;
  return req;
};

const payload = {
  hotel_id: 'sandbox-pms',
  channel: 'expedia',
  conversation_id: 'CONV-1',
  message_id: 'MSG-1',
  content: '¿Hay parking?',
  sender_type: 'guest',
  time_sent: '2026-01-15 12:54:00',
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getConnectivityBasicAuth.mockResolvedValue(CREDS);
  mocks.updateConnectivityStatus.mockResolvedValue(undefined);
  mocks.registrarMensajeEntrante.mockResolvedValue({
    ok: true,
    estado: 'recibido',
    conversacionId: 'conv-1',
    mensajeId: 'msg-1',
    tenantId: 't1',
    propertyId: 'p1',
  });
  mocks.registrarIncidenciaMensajeSinMapping.mockResolvedValue('inc-1');
});

describe('POST /api/hospitality/webhook/messages — contrato HTTP', () => {
  it('sin par Basic configurado → 503 con Retry-After', async () => {
    mocks.getConnectivityBasicAuth.mockResolvedValue(null);
    const res = await POST(conCuerpo(basic(), payload));
    expect(res.status).toBe(503);
    expect(res.headers.get('retry-after')).toBe('60');
  });

  it('sin cabecera Authorization → 401 con motivo sin_cabecera', async () => {
    const res = await POST(conCuerpo(new Request('https://x', { method: 'POST' }) as any, payload));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.diagnostico.motivo).toBe('sin_cabecera');
    expect(mocks.registrarMensajeEntrante).not.toHaveBeenCalled();
  });

  it('credenciales distintas → 401 con huellas, sin revelar el par', async () => {
    const res = await POST(conCuerpo(basic('pms', 'otra'), payload));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.diagnostico.motivo).toBe('credenciales_no_coinciden');
    expect(body.diagnostico.usuarioLen).toBe(3);
    expect(body.diagnostico.passwordLen).toBe(4);
    expect(body.diagnostico).toHaveProperty('huella');
    expect(JSON.stringify(body)).not.toContain('secreto');
  });

  it('esquema no Basic → 401 y no se registra nada', async () => {
    const res = await POST(conCuerpo(basic('pms', 'secreto', 'Bearer'), payload));
    expect(res.status).toBe(401);
    expect((await res.json()).diagnostico.motivo).toBe('esquema_no_basic');
    expect(mocks.registrarMensajeEntrante).not.toHaveBeenCalled();
  });

  it('JSON inválido → 400 (no reintentable)', async () => {
    // Con credenciales válidas (si no, el 401 llegaría antes que el parseo).
    const req = basic();
    req.json = async () => {
      throw new Error('boom');
    };
    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(mocks.registrarMensajeEntrante).not.toHaveBeenCalled();
  });

  it('mensaje registrado → 200 con estado recibido', async () => {
    const res = await POST(conCuerpo(basic(), payload));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ success: true, estado: 'recibido', conversacionId: 'conv-1' });
    expect(mocks.updateConnectivityStatus).toHaveBeenCalledWith(
      expect.objectContaining({ estado: 'conectado', resetErrores: true })
    );
  });

  it('entrega repetida del mismo message_id → 200 con estado duplicado', async () => {
    mocks.registrarMensajeEntrante.mockResolvedValue({
      ok: true,
      estado: 'duplicado',
      conversacionId: 'conv-1',
      mensajeId: 'msg-1',
      tenantId: 't1',
      propertyId: 'p1',
    });
    const res = await POST(conCuerpo(basic(), payload));
    expect(res.status).toBe(200);
    expect((await res.json()).estado).toBe('duplicado');
  });

  it('hotel_id sin mapping → 404 con Retry-After (el mapping puede estar en camino)', async () => {
    mocks.registrarMensajeEntrante.mockResolvedValue({
      ok: false,
      status: 'sin_mapping',
      error: 'Sin mapping activo para hotelCode 75fdbbce2e',
      hotelCode: '75fdbbce2e',
      canal: 'expedia',
    });
    const res = await POST(conCuerpo(basic(), payload));
    expect(res.status).toBe(404);
    expect(res.headers.get('retry-after')).toBe('300');
  });

  it('hotel_id sin mapping → la incidencia queda anotada con el código y el canal', async () => {
    mocks.registrarMensajeEntrante.mockResolvedValue({
      ok: false,
      status: 'sin_mapping',
      error: 'Sin mapping activo para hotelCode 75fdbbce2e',
      hotelCode: '75fdbbce2e',
      canal: 'expedia',
    });
    const res = await POST(conCuerpo(basic(), payload));
    // El webhook responde su 404 igual: la incidencia es para el panel, no para
    // el proveedor. Pero queda anotada, con id en el cuerpo para diagnóstico.
    expect((await res.json()).incidenciaId).toBe('inc-1');
    expect(mocks.registrarIncidenciaMensajeSinMapping).toHaveBeenCalledWith({
      hotelCode: '75fdbbce2e',
      canal: 'expedia',
      error: 'Sin mapping activo para hotelCode 75fdbbce2e',
    });
  });

  it('la incidencia NO lleva el mensaje del huésped (solo código, canal y motivo)', async () => {
    mocks.registrarMensajeEntrante.mockResolvedValue({
      ok: false,
      status: 'sin_mapping',
      error: 'Sin mapping activo para hotelCode 75fdbbce2e',
      hotelCode: '75fdbbce2e',
      canal: 'expedia',
    });
    await POST(conCuerpo(basic(), payload));
    const enviado = JSON.stringify(mocks.registrarIncidenciaMensajeSinMapping.mock.calls[0][0]);
    expect(enviado).not.toContain('parking');
    expect(Object.keys(mocks.registrarIncidenciaMensajeSinMapping.mock.calls[0][0])).toEqual([
      'hotelCode',
      'canal',
      'error',
    ]);
  });

  it('si el payload no se puede normalizar, no hay código y no se anota incidencia', async () => {
    mocks.registrarMensajeEntrante.mockResolvedValue({
      ok: false,
      status: 'sin_mapping',
      error: 'Faltan campos obligatorios: hotel_id',
    });
    const res = await POST(conCuerpo(basic(), { channel: 'expedia' }));
    expect(res.status).toBe(404);
    expect(mocks.registrarIncidenciaMensajeSinMapping).not.toHaveBeenCalled();
  });

  it('payload que no se puede representar → 400 sin Retry-After', async () => {
    mocks.registrarMensajeEntrante.mockResolvedValue({
      ok: false,
      status: 'invalido',
      error: 'Faltan campos obligatorios: message_id',
    });
    const res = await POST(conCuerpo(basic(), { hotel_id: 'x', channel: 'expedia', conversation_id: 'c' }));
    expect(res.status).toBe(400);
    expect(res.headers.get('retry-after')).toBeNull();
    // Un defecto de datos no es una incidencia de conectividad.
    expect(mocks.registrarIncidenciaMensajeSinMapping).not.toHaveBeenCalled();
  });

  it('no se guarda el payload crudo del huésped (lleva PII)', () => {
    const fuente = fs.readFileSync(
      path.join(process.cwd(), 'app/api/hospitality/webhook/messages/route.ts'),
      'utf8'
    );
    expect(fuente).not.toContain('hospitalityWebhookEvent');
    expect(fuente).toContain('registrarMensajeEntrante');
  });

  it('la cabecera Basic se lee de la pieza compartida con el webhook de reservas', () => {
    const fuente = fs.readFileSync(
      path.join(process.cwd(), 'app/api/hospitality/webhook/messages/route.ts'),
      'utf8'
    );
    expect(fuente).toContain("from '@/lib/hospitality/webhook-basic-auth'");
    expect(fuente).not.toContain('function readBasicAuth');
  });

  it('GET informa del endpoint sin secretos', async () => {
    const res = await GET();
    const body = await res.json();
    expect(body.endpoint).toBe('webhook-mensajes');
    expect(JSON.stringify(body)).not.toContain('secreto');
  });
});
