// @vitest-environment node
//
// Hotel de la sonda de conectividad: NUNCA el sandbox del contrato si hay un
// hotel REAL ya vinculado.
//
// Por qué existe
// --------------
// La sonda (`property_details`) nació apuntando al hotel del sandbox del
// contrato (`sandbox-pms`) y el proveedor lo retiró para los partners de
// producción: con el par Basic y el ID de socio CORRECTOS, `sandbox-pms`
// responde `403 {"success":false,"message":"Access Denied - sandbox-pms"}`. El
// panel y el health-check pintaban en rojo una capa que funcionaba, y el hotel
// que probaba sin escribir un código —o el cron, que no lo escribe nunca—
// recibía ese 403 como si fuera suyo.
//
// Ahora el orden es: entorno (`CONNECTIVITY_HEALTH_HOTEL`) → config del
// proveedor (`configuracion.healthHotelCode`) → `hotelCode` de una propiedad YA
// vinculada (`ConnectivityMapping.externalPropertyId`, el mismo código con el
// que se empuja inventario) → sandbox del contrato. Este archivo fija ese orden
// y que las tres superficies (botón «Probar» del panel admin, health-check y
// Conectividad del hotel) usen la MISMA pieza.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const mocks = vi.hoisted(() => ({
  providerFindUnique: vi.fn(),
  mappingFindFirst: vi.fn(),
  testConnection: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    connectivityProvider: { findUnique: mocks.providerFindUnique },
    connectivityMapping: { findFirst: mocks.mappingFindFirst },
  },
  default: {},
}));

vi.mock('@/lib/api-key-auth', () => ({
  authenticateRequest: async () => ({ valid: true, tenant: { id: 'tenant_hotel' } }),
}));

vi.mock('@/lib/hospitality/permissions', () => ({
  exigirPermisoHospitality: () => null,
}));

// Mock PARCIAL: la resolución del hotel (lo que aquí se comprueba) es la real;
// solo se sustituye la llamada al proveedor.
vi.mock('@/lib/hospitality/connectivity', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/hospitality/connectivity')>();
  return {
    ...original,
    testConnectivityConnection: mocks.testConnection,
  };
});

import {
  CONNECTIVITY_SANDBOX_HOTEL,
  getHotelVinculadoParaSonda,
  resolveProbeHotelCode,
  resolverHotelDeSonda,
} from '@/lib/hospitality/connectivity';
import { POST } from '@/app/api/hospitality/conectividad/route';

const RAIZ = path.resolve(__dirname, '..');
const HOTEL_REAL = '75fdbbce2e';

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.CONNECTIVITY_HEALTH_HOTEL;
  mocks.mappingFindFirst.mockResolvedValue(null);
});

describe('getHotelVinculadoParaSonda — el hotelCode de un vínculo activo', () => {
  it('devuelve el externalPropertyId del vínculo y filtra por proveedor activo', async () => {
    mocks.mappingFindFirst.mockResolvedValue({ externalPropertyId: HOTEL_REAL });

    const code = await getHotelVinculadoParaSonda('tenant_hotel');

    expect(code).toBe(HOTEL_REAL);
    const where = mocks.mappingFindFirst.mock.calls[0][0].where;
    expect(where).toMatchObject({
      provider: 'channel_connectivity',
      estado: 'activo',
      tenantId: 'tenant_hotel',
    });
    // El más antiguo: la sonda no puede cambiar de hotel entre ejecuciones.
    expect(mocks.mappingFindFirst.mock.calls[0][0].orderBy).toEqual({ fechaCreacion: 'asc' });
  });

  it('sin tenant no acota por cliente (sondas de plataforma: health-check y panel admin)', async () => {
    mocks.mappingFindFirst.mockResolvedValue({ externalPropertyId: HOTEL_REAL });

    await getHotelVinculadoParaSonda();

    expect(mocks.mappingFindFirst.mock.calls[0][0].where).not.toHaveProperty('tenantId');
  });

  it('un vínculo sin código o con solo espacios no es un hotel (nunca se sondea la cadena vacía)', async () => {
    mocks.mappingFindFirst.mockResolvedValue({ externalPropertyId: '   ' });
    expect(await getHotelVinculadoParaSonda()).toBeNull();

    mocks.mappingFindFirst.mockResolvedValue(null);
    expect(await getHotelVinculadoParaSonda()).toBeNull();
  });
});

describe('resolverHotelDeSonda — orden: entorno → config → hotel vinculado → sandbox', () => {
  it('sin nada configurado usa el hotel REAL vinculado, no el sandbox', async () => {
    mocks.mappingFindFirst.mockResolvedValue({ externalPropertyId: HOTEL_REAL });

    expect(await resolverHotelDeSonda({ configuracion: null }, 'tenant_hotel')).toBe(HOTEL_REAL);
  });

  it('sin ningún vínculo cae al sandbox del contrato (no se inventa un hotel)', async () => {
    mocks.mappingFindFirst.mockResolvedValue(null);

    expect(await resolverHotelDeSonda({ configuracion: null })).toBe(CONNECTIVITY_SANDBOX_HOTEL);
  });

  it('la config del proveedor gana al vínculo y no se consulta la base de datos', async () => {
    mocks.mappingFindFirst.mockResolvedValue({ externalPropertyId: HOTEL_REAL });

    expect(await resolverHotelDeSonda({ configuracion: { healthHotelCode: 'hotel-config' } })).toBe(
      'hotel-config'
    );
    expect(mocks.mappingFindFirst).not.toHaveBeenCalled();
  });

  it('el entorno gana a todo y tampoco consulta la base de datos', async () => {
    process.env.CONNECTIVITY_HEALTH_HOTEL = 'hotel-entorno';
    try {
      expect(
        await resolverHotelDeSonda(
          { configuracion: { healthHotelCode: 'hotel-config' } },
          'tenant_hotel'
        )
      ).toBe('hotel-entorno');
      expect(mocks.mappingFindFirst).not.toHaveBeenCalled();
    } finally {
      delete process.env.CONNECTIVITY_HEALTH_HOTEL;
    }
  });

  it('la pieza pura conserva su orden con el vínculo como tercer escalón', () => {
    // Sin vínculo el comportamiento de siempre: sandbox del contrato.
    expect(resolveProbeHotelCode(null)).toBe(CONNECTIVITY_SANDBOX_HOTEL);
    // Con vínculo, el hotel real gana al sandbox…
    expect(resolveProbeHotelCode(null, HOTEL_REAL)).toBe(HOTEL_REAL);
    // …y la config sigue ganando al vínculo.
    expect(
      resolveProbeHotelCode({ configuracion: { healthHotelCode: 'hotel-config' } }, HOTEL_REAL)
    ).toBe('hotel-config');
    // Un vínculo en blanco no es un hotel.
    expect(resolveProbeHotelCode(null, '   ')).toBe(CONNECTIVITY_SANDBOX_HOTEL);
  });
});

describe('POST /api/hospitality/conectividad — comprobar con la propiedad del hotel', () => {
  function reqPost(body: unknown): any {
    return { json: async () => body, headers: { get: () => null } };
  }

  beforeEach(() => {
    mocks.testConnection.mockResolvedValue({ ok: true, hotelCode: HOTEL_REAL });
  });

  it('sin hotelCode comprueba con el de la propiedad ya vinculada', async () => {
    mocks.mappingFindFirst.mockResolvedValue({ externalPropertyId: HOTEL_REAL });

    const res = await POST(reqPost({ accion: 'probar' }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(mocks.testConnection).toHaveBeenCalledWith(HOTEL_REAL, 'tenant_hotel');
    expect(body.hotelCode).toBe(HOTEL_REAL);
  });

  it('el código que escribe el hotel manda sobre el vínculo (para probar otro código)', async () => {
    mocks.mappingFindFirst.mockResolvedValue({ externalPropertyId: HOTEL_REAL });

    await POST(reqPost({ accion: 'probar', hotelCode: 'otro-hotel' }));

    expect(mocks.testConnection).toHaveBeenCalledWith('otro-hotel', 'tenant_hotel');
    expect(mocks.mappingFindFirst).not.toHaveBeenCalled();
  });

  it('sin vínculo ni código NO se sondea el sandbox: se pide el código', async () => {
    mocks.mappingFindFirst.mockResolvedValue(null);

    const res = await POST(reqPost({ accion: 'probar' }));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/vincula/i);
    expect(mocks.testConnection).not.toHaveBeenCalled();
  });

  it('el 403 del proveedor se explica como causa (hotel sin conceder), no como «error 403» a secas', async () => {
    mocks.testConnection.mockResolvedValue({
      ok: false,
      error:
        'El hotel no está concedido a este ID de socio: El servicio reconoce las credenciales y el ID de socio…',
    });

    const res = await POST(reqPost({ accion: 'probar', hotelCode: HOTEL_REAL }));
    const body = await res.json();

    // Siempre 200 con `ok` en el cuerpo: un 5xx lo reemplazaría el proxy.
    expect(res.status).toBe(200);
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/concedido/i);
  });
});

describe('las tres superficies usan la MISMA pieza (no vuelven al sandbox fijo)', () => {
  it.each([
    'app/api/admin/conectividad/test/route.ts',
    'lib/cron/hospitality-connectivity-health.ts',
  ])('%s resuelve el hotel con resolverHotelDeSonda', (relativo) => {
    const fuente = fs.readFileSync(path.join(RAIZ, relativo), 'utf8');
    expect(fuente).toContain('resolverHotelDeSonda');
  });

  it('la Conectividad del hotel usa su vínculo por defecto', () => {
    const fuente = fs.readFileSync(
      path.join(RAIZ, 'app/api/hospitality/conectividad/route.ts'),
      'utf8'
    );
    expect(fuente).toContain('getHotelVinculadoParaSonda(tenantId)');
    // Y NO cae al sandbox: sin vínculo pide el código.
    expect(fuente).not.toContain('CONNECTIVITY_SANDBOX_HOTEL');
  });

  it('la pantalla del hotel se puede comprobar sin escribir el código (usa su vínculo)', () => {
    // Antes el botón exigía el código y el hotel no tenía forma de saberlo: se
    // quedaba con el 403 del sandbox. El campo sigue existiendo (para probar
    // otro código) pero ya no bloquea la comprobación.
    const fuente = fs.readFileSync(
      path.join(RAIZ, 'app/dashboard/hospitality/conectividad/page.tsx'),
      'utf8'
    );
    expect(fuente).toContain('disabled={probando}');
    expect(fuente).not.toContain("disabled={probando || hotelCode.trim() === ''}");
    expect(fuente).toContain('propiedad vinculada');
  });
});
