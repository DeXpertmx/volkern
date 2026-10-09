import { describe, it, expect, vi, beforeEach } from 'vitest';
import { encrypt } from '@/lib/core/crypto';

/**
 * Advertencias del proveedor en un push.
 *
 * El caso real (Ciudad Patio Cuarenta, 9-oct 2026): el push de tarifas salió
 * con `rateplanCode: "2b"` —el roomCode, porque la unidad no tenía planes de
 * tarifa— y el proveedor contestó
 *
 *   HTTP 200 {"success": true, "message": "Request Received Successfully",
 *             "warnings": ["INVALID_RATEPLAN_CODE : 2b"]}
 *
 * Es decir: recibió la petición y la DESCARTÓ. Nuestro log lo apuntó como
 * `exito` (miraba solo `success`), así que el panel quedó en verde mientras el
 * canal no recibía ni una tarifa: un fallo invisible desde dentro y evidente
 * desde fuera. Estas comprobaciones fijan la regla nueva: un 200 con
 * advertencias NO es un push limpio, y el texto de la advertencia viaja al log
 * y al estado del proveedor.
 */

const hoisted = vi.hoisted(() => ({
  providerFindUnique: vi.fn(),
  providerUpdate: vi.fn(),
  configFindUnique: vi.fn(),
  configUpsert: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    connectivityProvider: {
      findUnique: hoisted.providerFindUnique,
      update: hoisted.providerUpdate,
    },
    hospitalityConnectivityConfig: {
      findUnique: hoisted.configFindUnique,
      upsert: hoisted.configUpsert,
    },
  },
}));

import {
  CONNECTIVITY_PROVIDER_KEY,
  CONNECTIVITY_PROVIDER_NOMBRE,
  advertenciasDeRespuesta,
  pushInventory,
  pushInventoryRestrictions,
  pushRates,
} from '@/lib/hospitality/connectivity';

const TENANT = 'tenant_hotel';
const PARTNER = 'partner-id';

function filaConfigurada() {
  return {
    id: 'prov_1',
    providerKey: CONNECTIVITY_PROVIDER_KEY,
    nombreVisible: CONNECTIVITY_PROVIDER_NOMBRE,
    baseUrl: 'https://live.example.internal',
    partnerIdEnc: encrypt(PARTNER),
    usernameEnc: encrypt('usuario-api'),
    passwordEnc: encrypt('clave-secreta'),
    estado: 'configurado',
    ultimaSincronizacion: null,
    ultimoEvento: null,
    ultimaVerificacion: null,
    contadorErrores: 0,
    configuracion: null,
    fechaCreacion: new Date(),
    fechaEdicion: new Date(),
  };
}

const fetchMock = vi.fn();

function respuesta(json: unknown, status = 200) {
  return new Response(JSON.stringify(json), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const ADVERTENCIA_REAL = 'INVALID_RATEPLAN_CODE : 2b';
const RESPUESTA_CON_ADVERTENCIA = {
  success: true,
  message: 'Request Received Successfully',
  warnings: [ADVERTENCIA_REAL],
};

const RATES = [{ startDate: '2026-10-09', endDate: '2027-04-06', rates: [{ roomCode: '2b', rateplanCode: '2b', rate: 120 }] }];

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CONNECTIVITY_BASE_URL = 'https://live.example.internal';
  hoisted.providerFindUnique.mockResolvedValue(filaConfigurada());
  hoisted.configFindUnique.mockResolvedValue(null);
  hoisted.configUpsert.mockResolvedValue({});
  fetchMock.mockResolvedValue(respuesta({ success: true, message: 'Request Received Successfully' }));
  vi.stubGlobal('fetch', fetchMock);
});

describe('advertenciasDeRespuesta — pieza pura', () => {
  it('lee las advertencias reales y descarta formas que no son texto', () => {
    expect(advertenciasDeRespuesta(RESPUESTA_CON_ADVERTENCIA)).toEqual([ADVERTENCIA_REAL]);
    expect(advertenciasDeRespuesta({ warnings: ['  RATE_MISSING  ', '', 7, null, { a: 1 }] })).toEqual([
      'RATE_MISSING',
    ]);
  });

  it('sin advertencias (o con formas raras) devuelve lista vacía, nunca inventa una', () => {
    expect(advertenciasDeRespuesta(undefined)).toEqual([]);
    expect(advertenciasDeRespuesta(null)).toEqual([]);
    expect(advertenciasDeRespuesta('texto')).toEqual([]);
    expect(advertenciasDeRespuesta({ success: true })).toEqual([]);
    expect(advertenciasDeRespuesta({ warnings: [] })).toEqual([]);
    expect(advertenciasDeRespuesta({ warnings: 'INVALID_RATEPLAN_CODE' })).toEqual([]);
  });
});

describe('un push con advertencias no es un push limpio', () => {
  it('tarifas: 200 con INVALID_RATEPLAN_CODE se registra como fallo y nombra la advertencia', async () => {
    fetchMock.mockResolvedValue(respuesta(RESPUESTA_CON_ADVERTENCIA));

    const result = await pushRates('75fdbbce2e', RATES as never, TENANT);

    expect(result.ok).toBe(false);
    // El HTTP real se conserva: el fallo es de datos, no de transporte.
    expect(result.httpStatus).toBe(200);
    expect(result.error).toContain(ADVERTENCIA_REAL);
    expect(result.error).toContain('descartó');
    // El cuerpo íntegro sigue disponible para `HospitalitySyncLog.responseBody`.
    expect(result.respuestaExterna).toEqual(RESPUESTA_CON_ADVERTENCIA);
  });

  it('inventario: la misma regla (una advertencia no puede quedar enterrada por endpoint)', async () => {
    fetchMock.mockResolvedValue(
      respuesta({ success: true, message: 'Request Received Successfully', warnings: ['ROOM_NOT_MAPPED : 2b'] })
    );

    const result = await pushInventory('75fdbbce2e', [] as never, TENANT);

    expect(result.ok).toBe(false);
    expect(result.error).toContain('ROOM_NOT_MAPPED : 2b');
  });

  it('restricciones (endpoint genérico): también', async () => {
    fetchMock.mockResolvedValue(
      respuesta({ success: true, warnings: ['RATE_PLAN_UNKNOWN'] })
    );

    const result = await pushInventoryRestrictions('75fdbbce2e', [] as never, TENANT);

    expect(result.ok).toBe(false);
    expect(result.error).toContain('RATE_PLAN_UNKNOWN');
  });
});

describe('contrapruebas: lo que NO cambia', () => {
  it('un 200 sin advertencias sigue siendo éxito', async () => {
    const result = await pushRates('75fdbbce2e', RATES as never, TENANT);

    expect(result.ok).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('un 200 con success:false sigue siendo error con su mensaje del proveedor', async () => {
    fetchMock.mockResolvedValue(respuesta({ success: false, message: 'Partner is disabled!' }));

    const result = await pushRates('75fdbbce2e', RATES as never, TENANT);

    expect(result.ok).toBe(false);
    expect(result.error).toBe('Partner is disabled!');
  });

  it('un HTTP de error sigue siendo error', async () => {
    fetchMock.mockResolvedValue(respuesta({ success: false, message: 'Bad Request' }, 400));

    const result = await pushRates('75fdbbce2e', RATES as never, TENANT);

    expect(result.ok).toBe(false);
    expect(result.httpStatus).toBe(400);
  });
});
