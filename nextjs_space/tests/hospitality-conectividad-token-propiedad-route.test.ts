// @vitest-environment node
//
// Endpoint de la credencial de conectividad por propiedad.
//
// Tres cosas que no pueden fallar y que aquí se comprueban sobre la respuesta
// HTTP real (no sobre el módulo): el token no vuelve en ningún cuerpo, la
// propiedad tiene que ser de la cuenta, y sin permiso no se escribe.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { decrypt, encrypt } from '@/lib/core/crypto';

const mocks = vi.hoisted(() => ({
  authenticateRequest: vi.fn(),
  hospitalityProperty: { findMany: vi.fn(), findFirst: vi.fn() },
  hospitalityConnectivityPropertyConfig: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    upsert: vi.fn(),
  },
}));

vi.mock('@/lib/db', () => ({ prisma: mocks, default: mocks }));
vi.mock('@/lib/api-key-auth', () => ({ authenticateRequest: mocks.authenticateRequest }));

const { GET, PUT } = await import('@/app/api/hospitality/conectividad/propiedades/route');

const TOKEN = 'tok_route_secreto_123';
const PROPIEDAD = { id: 'p1', nombre: 'Villa Mar Azul' };

function fila(parcial: Record<string, unknown> = {}) {
  return {
    propertyId: 'p1',
    externalPropertyId: '4821',
    tokenEnc: encrypt(TOKEN),
    activo: true,
    modo: 'escritura',
    estado: 'configurado',
    ultimoChequeo: null,
    ultimoError: null,
    ...parcial,
  };
}

function peticion(metodo: string, cuerpo?: unknown) {
  return new Request('https://volkern.app/api/hospitality/conectividad/propiedades', {
    method: metodo,
    headers: cuerpo ? { 'Content-Type': 'application/json' } : undefined,
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  }) as any;
}

const AUTH_OK = {
  valid: true,
  tenant: { id: 't1' },
  user: { id: 'u1', role: { id: 'r1', nombre: 'Superadmin', permisos: { all: true } } },
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.authenticateRequest.mockResolvedValue(AUTH_OK);
  mocks.hospitalityProperty.findMany.mockResolvedValue([PROPIEDAD]);
  mocks.hospitalityProperty.findFirst.mockResolvedValue(PROPIEDAD);
  mocks.hospitalityConnectivityPropertyConfig.findMany.mockResolvedValue([fila()]);
  mocks.hospitalityConnectivityPropertyConfig.findUnique.mockResolvedValue(fila());
  mocks.hospitalityConnectivityPropertyConfig.upsert.mockResolvedValue({});
  // Guardar prueba la credencial: la respuesta del proveedor se simula entera,
  // sin salir a la red.
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({ hotelName: 'Hotel Prueba', isActive: true, rentalsCount: 2 }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
    )
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('GET — estado de la credencial por propiedad', () => {
  it('devuelve las propiedades con su estado y sin el token', async () => {
    const res = await GET(peticion('GET'));
    const cuerpo = await res.json();

    expect(res.status).toBe(200);
    expect(cuerpo.propiedades).toHaveLength(1);
    expect(cuerpo.propiedades[0]).toMatchObject({
      id: 'p1',
      nombre: 'Villa Mar Azul',
      conectividad: { configurado: true, activo: true, modo: 'escritura', externalPropertyId: '4821' },
    });
    expect(JSON.stringify(cuerpo)).not.toContain(TOKEN);
    expect(JSON.stringify(cuerpo)).not.toContain('tokenEnc');
  });

  it('una propiedad sin fila se lee como sin configurar, no como error', async () => {
    mocks.hospitalityConnectivityPropertyConfig.findMany.mockResolvedValue([]);

    const res = await GET(peticion('GET'));
    const cuerpo = await res.json();

    expect(cuerpo.propiedades[0].conectividad).toMatchObject({
      configurado: false,
      activo: false,
      estado: 'sin_configurar',
      externalPropertyId: null,
    });
  });

  it('sin sesión no se lee nada', async () => {
    mocks.authenticateRequest.mockResolvedValue({ valid: false, error: 'No autorizado' });

    const res = await GET(peticion('GET'));

    expect(res.status).toBe(401);
  });
});

describe('PUT — guardar la credencial', () => {
  it('guarda el token cifrado y no lo devuelve en la respuesta', async () => {
    const res = await PUT(
      peticion('PUT', {
        propertyId: 'p1',
        externalPropertyId: '4821',
        token: TOKEN,
      })
    );
    const cuerpo = await res.json();

    expect(res.status).toBe(200);
    expect(cuerpo.ok).toBe(true);
    expect(JSON.stringify(cuerpo)).not.toContain(TOKEN);
    expect(JSON.stringify(cuerpo)).not.toContain('tokenEnc');

    const upsert = mocks.hospitalityConnectivityPropertyConfig.upsert.mock.calls[0][0];
    const guardado = upsert.update?.tokenEnc ?? upsert.create?.tokenEnc;
    expect(guardado).toBeTypeOf('string');
    expect(guardado).not.toContain(TOKEN);
    expect(decrypt(guardado)).toBe(TOKEN);
  });

  it('devuelve el resultado de la prueba con el proveedor, sin el token', async () => {
    const res = await PUT(
      peticion('PUT', { propertyId: 'p1', externalPropertyId: '4821', token: TOKEN })
    );
    const cuerpo = await res.json();

    expect(res.status).toBe(200);
    expect(cuerpo.sondeo).toMatchObject({
      probado: true,
      ok: true,
      estado: 'conectado',
      hotel: 'Hotel Prueba',
      rentals: 2,
    });
    expect(JSON.stringify(cuerpo)).not.toContain(TOKEN);
  });

  it('un token rechazado responde 200 igual: se guarda marcado en error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 404 })));

    const res = await PUT(
      peticion('PUT', { propertyId: 'p1', externalPropertyId: '4821', token: TOKEN })
    );
    const cuerpo = await res.json();

    expect(res.status).toBe(200);
    expect(cuerpo.ok).toBe(true);
    expect(cuerpo.sondeo).toMatchObject({ probado: true, ok: false });
    expect(cuerpo.sondeo.error).toBeTruthy();
    expect(JSON.stringify(cuerpo)).not.toContain(TOKEN);
    // Lo guardado es lo que se probó, con su error.
    const upsert = mocks.hospitalityConnectivityPropertyConfig.upsert.mock.calls[0][0];
    expect(upsert.create?.estado ?? upsert.update?.estado).toBe('error');
  });

  it('la propiedad de otra cuenta no se toca (404)', async () => {
    mocks.hospitalityProperty.findFirst.mockResolvedValue(null);

    const res = await PUT(
      peticion('PUT', { propertyId: 'ajena', externalPropertyId: '1', token: TOKEN })
    );

    expect(res.status).toBe(404);
    expect(mocks.hospitalityConnectivityPropertyConfig.upsert).not.toHaveBeenCalled();
  });

  it('sin token y sin credencial previa responde 400 señalando el campo', async () => {
    mocks.hospitalityConnectivityPropertyConfig.findUnique.mockResolvedValue(null);

    const res = await PUT(peticion('PUT', { propertyId: 'p1', externalPropertyId: '4821' }));
    const cuerpo = await res.json();

    expect(res.status).toBe(400);
    expect(cuerpo).toMatchObject({ ok: false, campo: 'token' });
    expect(JSON.stringify(cuerpo)).not.toContain(TOKEN);
  });

  it('un token que no es texto se rechaza sin intentar guardarlo', async () => {
    const res = await PUT(
      peticion('PUT', { propertyId: 'p1', externalPropertyId: '4821', token: 12345 })
    );

    expect(res.status).toBe(400);
    expect(mocks.hospitalityConnectivityPropertyConfig.upsert).not.toHaveBeenCalled();
  });

  it('sin la capacidad de gestionar no se escribe', async () => {
    mocks.authenticateRequest.mockResolvedValue({
      valid: true,
      tenant: { id: 't1' },
      user: { id: 'u2', role: { id: 'r2', nombre: 'Huésped', permisos: {} } },
    });

    const res = await PUT(
      peticion('PUT', { propertyId: 'p1', externalPropertyId: '4821', token: TOKEN })
    );

    expect(res.status).toBe(403);
    expect(mocks.hospitalityConnectivityPropertyConfig.upsert).not.toHaveBeenCalled();
  });
});
