// @vitest-environment node
//
// Saneador de respuestas externas del proveedor
// (lib/hospitality/conectividad-secreto.ts): el proveedor puede reflejar el
// header Authorization u otros secretos en sus errores — y esos cuerpos se
// muestran en el diálogo de prueba y se persisten en responseBody.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  sanitizarRespuestaExterna,
  MARCA_OCULTA,
  MARCA_TRUNCADO,
  MARCA_CIRCULAR,
} from '@/lib/hospitality/conectividad-secreto';

const AUTH = `Basic ${Buffer.from('usuario-api:clave-super-secreta').toString('base64')}`;

describe('sanitizarRespuestaExterna — redacción por clave sensible', () => {
  it.each([
    'authorization',
    'Authorization',
    'X-API-Key',
    'api_key',
    'apiKey',
    'x-api-key',
    'token',
    'access_token',
    'refreshToken',
    'password',
    'Password',
    'secret',
    'client_secret',
    'cookie',
    'Set-Cookie',
    'credentials',
    'privateKey',
    'signature',
    'sessionid',
  ])('clave «%s» → su valor se oculta', (clave) => {
    const salida = sanitizarRespuestaExterna({ [clave]: 'valor-super-secreto' }) as Record<string, unknown>;
    expect(salida[clave]).toBe(MARCA_OCULTA);
    expect(JSON.stringify(salida)).not.toContain('valor-super-secreto');
  });

  it('anida la redacción a cualquier profundidad', () => {
    const salida = sanitizarRespuestaExterna({
      error: 'unauthorized',
      detail: { headers: { Authorization: AUTH, 'Content-Type': 'application/json' } },
    }) as any;

    expect(salida.detail.headers.Authorization).toBe(MARCA_OCULTA);
    expect(salida.detail.headers['Content-Type']).toBe('application/json');
    expect(JSON.stringify(salida)).not.toContain('clave-super-secreta');
  });

  it('los arreglos también se recorren', () => {
    const salida = sanitizarRespuestaExterna({
      errores: [{ password: 'secreto-1' }, { campo: 'tarifa', detalle: 'negativa' }],
    }) as any;

    expect(salida.errores[0].password).toBe(MARCA_OCULTA);
    expect(salida.errores[1].detalle).toBe('negativa');
  });

  it('el objeto raíz también se redacta (no solo los anidados)', () => {
    const salida = sanitizarRespuestaExterna({ Authorization: AUTH }) as Record<string, unknown>;
    expect(salida.Authorization).toBe(MARCA_OCULTA);
  });
});

describe('sanitizarRespuestaExterna — patrones en VALORES (header incrustado)', () => {
  it('un string con "Basic base64" incrustado deja la credencial oculta', () => {
    const salida = sanitizarRespuestaExterna({
      message: `received: Authorization: ${AUTH}`,
    }) as Record<string, string>;

    expect(salida.message).toContain('basic [oculto]');
    expect(salida.message).not.toContain(Buffer.from('usuario-api:clave-super-secreta').toString('base64'));
    expect(salida.message).not.toContain('clave-super-secreta');
  });

  it('un string con "Bearer …" incrustado deja el token oculto', () => {
    const salida = sanitizarRespuestaExterna({
      detail: 'Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.sig rechazado',
    }) as Record<string, string>;

    expect(salida.detail).toContain('bearer [oculto]');
    expect(salida.detail).not.toContain('eyJhbGciOiJIUzI1NiJ9');
  });

  it('un string normal pasa intacto (sin falsos positivos cotidianos)', () => {
    const entrada = { message: 'Tarifa inválida para el rango 2026-09-01 → 2026-09-15' };
    expect(sanitizarRespuestaExterna(entrada)).toEqual(entrada);
  });
});

describe('sanitizarRespuestaExterna — límites', () => {
  it('cadenas gigantes se recortan (el 404 de nginx trae HTML enorme)', () => {
    const html = `<html>${'x'.repeat(20000)}</html>`;
    const salida = sanitizarRespuestaExterna({ body: html }) as Record<string, string>;
    expect(salida.body.length).toBeLessThanOrEqual(4100);
    expect(salida.body).toContain('[truncado]');
  });

  it('profundidad patológica se corta con [truncado]', () => {
    let profundo: any = { hoja: 'ok' };
    for (let i = 0; i < 20; i++) profundo = { n: profundo };
    const salida = sanitizarRespuestaExterna(profundo);
    expect(JSON.stringify(salida)).toContain(MARCA_TRUNCADO);
  });

  it('referencia circular no cuelga el saneador', () => {
    const circular: any = { nombre: 'eco' };
    circular.yoMismo = circular;
    const salida = sanitizarRespuestaExterna(circular) as any;
    expect(salida.yoMismo).toBe(MARCA_CIRCULAR);
    expect(salida.nombre).toBe('eco');
  });

  it('primitivas y null pasan intactos', () => {
    expect(sanitizarRespuestaExterna(null)).toBeNull();
    expect(sanitizarRespuestaExterna('texto')).toBe('texto');
    expect(sanitizarRespuestaExterna(42)).toBe(42);
    expect(sanitizarRespuestaExterna(true)).toBe(true);
  });

  it('texto plano (fallback no-JSON) también se sanea como string', () => {
    const salida = sanitizarRespuestaExterna(`error con ${AUTH} dentro`) as string;
    expect(salida).toContain('basic [oculto]');
  });
});

describe('la fuente sanea: connectivity.ts redacta antes de exponer o persistir', () => {
  const hoisted = vi.hoisted(() => ({
    findUnique: vi.fn(),
    syncLogFindFirst: vi.fn(),
  }));

  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: 'invalid credentials',
            received: `Authorization: ${AUTH}`,
          }),
          { status: 401, headers: { 'content-type': 'application/json' } },
        ),
      ),
    );
    process.env.CONNECTIVITY_BASE_URL = 'https://live.example.internal';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.resetModules();
  });

  function filaConCreds() {
    return {
      providerKey: 'channel_connectivity',
      partnerIdEnc: 'enc(partner-1)',
      usernameEnc: 'enc(usuario-api)',
      passwordEnc: 'enc(clave-super-secreta)',
    };
  }

  it('testConnectivityConnection devuelve la respuesta con el Basic redactado (diálogo)', async () => {
    hoisted.findUnique.mockResolvedValue(filaConCreds());
    vi.doMock('@/lib/db', () => ({
      default: { connectivityProvider: { findUnique: hoisted.findUnique }, hospitalitySyncLog: { findFirst: hoisted.syncLogFindFirst } },
      prisma: { connectivityProvider: { findUnique: hoisted.findUnique }, hospitalitySyncLog: { findFirst: hoisted.syncLogFindFirst } },
    }));
    vi.doMock('@/lib/core/crypto', () => ({
      encrypt: (v: string) => `enc(${v})`,
      decrypt: (v: string) => v.replace(/^enc\(|\)$/g, ''),
    }));

    const { testConnectivityConnection } = await import('@/lib/hospitality/connectivity');
    const resultado = await testConnectivityConnection();

    expect(resultado.ok).toBe(false);
    const texto = JSON.stringify(resultado.respuestaExterna);
    expect(texto).toContain('[oculto]');
    expect(texto).not.toContain(Buffer.from('usuario-api:clave-super-secreta').toString('base64'));
  });

  it('fetchReservations persiste y devuelve el cuerpo saneado (responseBody)', async () => {
    hoisted.findUnique.mockResolvedValue(filaConCreds());
    vi.doMock('@/lib/db', () => ({
      default: { connectivityProvider: { findUnique: hoisted.findUnique } },
      prisma: { connectivityProvider: { findUnique: hoisted.findUnique } },
    }));
    vi.doMock('@/lib/core/crypto', () => ({
      encrypt: (v: string) => `enc(${v})`,
      decrypt: (v: string) => v.replace(/^enc\(|\)$/g, ''),
    }));

    const { fetchReservations } = await import('@/lib/hospitality/connectivity');
    const resultado = await fetchReservations('hotel-x', '2026-09-01', '2026-09-30');

    const texto = JSON.stringify(resultado.respuestaExterna);
    expect(texto).toContain('[oculto]');
    expect(texto).not.toContain(Buffer.from('usuario-api:clave-super-secreta').toString('base64'));
  });
});
