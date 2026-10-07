import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * Guard de aislamiento multi-tenant de Hospitality (§31).
 *
 * No comprueba una ruta concreta: monta TODAS las rutas de lectura del módulo
 * sobre un Prisma que graba cada llamada y exige que ninguna operación sobre un
 * modelo de hospitality se ejecute sin el `tenantId` de la sesión.
 *
 * Por qué existe: las rutas de hospitality NO corren dentro de `dbContext`
 * (usan `authenticateRequest` directamente), así que `prisma` cae al cliente
 * global y el aislamiento depende enteramente de que cada `where` lleve su
 * `tenantId`. Un `findMany` nuevo sin ese filtro no rompe ningún test
 * funcional —simplemente devuelve los datos de otra cuenta—, que es justo el
 * fallo que aquí se convierte en rojo.
 *
 * Reglas:
 *  - Lectura (`findMany`/`findFirst`/`findUnique`/`count`/`aggregate`/`groupBy`)
 *    de un modelo `hospitality*` o `connectivityMapping`: `where.tenantId` debe
 *    ser el tenant de la sesión.
 *  - Escritura (`create`): `data.tenantId` debe ser el de la sesión.
 *  - El `tenantId` que mande el cliente por query o body se ignora SIEMPRE:
 *    ningún argumento puede contener el tenant ajeno.
 */

// Las fábricas de `vi.mock` se elevan al principio del fichero, así que todo lo
// que referencian (tenant, stub, contexto) tiene que vivir dentro de
// `vi.hoisted` — una constante de módulo quedaría en zona muerta temporal.
const hoisted = vi.hoisted(() => {
  type Call = { model: string; op: string; args: any };

  const TENANT = 'tenant_a';
  const TENANT_AJENO = 'tenant_b';

  const calls: Call[] = [];

  function defaultFor(op: string): unknown {
    switch (op) {
      case 'findMany':
      case 'groupBy':
        return [];
      case 'findFirst':
      case 'findUnique':
      case 'findUniqueOrThrow':
      case 'findFirstOrThrow':
        return null;
      case 'count':
        return 0;
      case 'aggregate':
        return { _count: 0, _sum: {}, _avg: {}, _min: {}, _max: {} };
      case 'updateMany':
      case 'deleteMany':
      case 'createMany':
        return { count: 0 };
      case 'create':
      case 'update':
      case 'upsert':
      case 'delete':
        return {};
      default:
        return null;
    }
  }

  const modelCache = new Map<string, unknown>();

  function model(name: string): unknown {
    if (!modelCache.has(name)) {
      modelCache.set(
        name,
        new Proxy(
          {},
          {
            get(_target, prop) {
              if (typeof prop !== 'string') return undefined;
              return (...args: any[]) => {
                calls.push({ model: name, op: prop, args: args[0] });
                return Promise.resolve(defaultFor(prop));
              };
            },
          },
        ),
      );
    }
    return modelCache.get(name);
  }

  // Los modelos "maestros" no llevan tenantId en su `where`; el módulo de
  // hospitality sí, y es lo único que este guard inspecciona.
  function esModeloDeTenant(m: string): boolean {
    return /^hospitality/i.test(m) || m === 'connectivityMapping';
  }

  const stub: any = new Proxy(
    {},
    {
      get(_target, prop) {
        if (typeof prop !== 'string' || prop === 'then') return undefined;
        if (prop === '$transaction') {
          return async (arg: any) =>
            Array.isArray(arg) ? Promise.all(arg) : arg(stub);
        }
        if (prop.startsWith('$')) return async () => [];
        return model(prop);
      },
    },
  );

  const dbContext = {
    run: (_store: unknown, fn: () => unknown) => fn(),
    getStore: () => undefined,
  };

  return { calls, stub, dbContext, esModeloDeTenant, TENANT, TENANT_AJENO };
});

const { calls, esModeloDeTenant, TENANT, TENANT_AJENO } = hoisted;

vi.mock('@/lib/db', () => ({
  prisma: hoisted.stub,
  default: hoisted.stub,
  globalPrisma: hoisted.stub,
  dbContext: hoisted.dbContext,
  getTenantDb: async () => ({ client: hoisted.stub, vaultSeed: null }),
  runWithTenant: async (_t: string, fn: () => unknown) => fn(),
  getCurrentTenantId: () => null,
  setCurrentTenantId: () => {},
  clearCurrentTenantId: () => {},
  initializeSkillsOnDemand: async () => {},
}));

vi.mock('@/lib/api-key-auth', () => ({
  authenticateRequest: vi.fn().mockResolvedValue({
    valid: true,
    authMethod: 'session',
    tenant: { id: hoisted.TENANT },
    user: {
      id: 'user_1',
      tenantId: hoisted.TENANT,
      role: { id: 'role_test', nombre: 'Admin', permisos: { all: true } },
    },
  }),
}));

// El permiso lo decide el rol (§27) y ya tiene sus propias pruebas: aquí se
// concede para que la ruta llegue a las consultas, que es lo que se audita.
vi.mock('@/lib/hospitality/permissions', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  exigirPermisoHospitality: vi.fn().mockReturnValue(null),
}));

vi.mock('@/lib/permissions', () => ({
  logAuditAction: vi.fn().mockResolvedValue(undefined),
}));

// Evita que una ruta haga red al empujar a la capa: aquí se audita el scoping.
vi.mock('@/lib/hospitality/sync', () => ({
  dispatchConnectivityPush: vi.fn().mockResolvedValue({ ok: true }),
}));

import { GET as getProperties, POST as postProperty } from '@/app/api/hospitality/properties/route';
import { GET as getUnits, POST as postUnit } from '@/app/api/hospitality/units/route';
import { GET as getReservations, POST as postReservation } from '@/app/api/hospitality/reservations/route';
import { GET as getRateplans, POST as postRateplan } from '@/app/api/hospitality/rateplans/route';
import { GET as getGuests } from '@/app/api/hospitality/guests/route';
import { GET as getBlocks, POST as postBlock } from '@/app/api/hospitality/blocks/route';
import { GET as getDashboard } from '@/app/api/hospitality/dashboard/route';
import { GET as getFinanzas } from '@/app/api/hospitality/finanzas/route';
import { GET as getOperations } from '@/app/api/hospitality/operations/route';
import { GET as getIncidencias } from '@/app/api/hospitality/incidencias/route';
import { POST as postSync } from '@/app/api/hospitality/sync/route';

/** Query hostil: un cliente intentando leer datos de otra cuenta. */
const QS_AJENA = `?tenantId=${TENANT_AJENO}&tenant=${TENANT_AJENO}&propertyId=prop_ajena&unitId=unit_ajena&id=res_ajena`;

function req(path: string, query = QS_AJENA) {
  return new NextRequest(`http://test.local/api/hospitality/${path}${query}`);
}

function bodyReq(path: string, body: Record<string, unknown>) {
  return new NextRequest(`http://test.local/api/hospitality/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tenantId: TENANT_AJENO, tenant: TENANT_AJENO, ...body }),
  });
}

const OPS_LECTURA = new Set(['findMany', 'findFirst', 'findUnique', 'count', 'aggregate', 'groupBy']);

function llamadasDeTenant() {
  return calls.filter((c) => esModeloDeTenant(c.model));
}

/**
 * Comprueba el invariante sobre lo grabado y devuelve las operaciones
 * inspeccionadas, para poder afirmar que la ruta llegó a consultar de verdad
 * (un 403 temprano también pasaría el guard sin haber ejercitado nada).
 */
function auditar() {
  const deTenant = llamadasDeTenant();
  const problemas: string[] = [];

  for (const c of deTenant) {
    const args = c.args ?? {};
    const json = JSON.stringify(args);

    if (json.includes(TENANT_AJENO)) {
      problemas.push(
        `${c.model}.${c.op} recibió el tenant ajeno "${TENANT_AJENO}" desde el cliente`,
      );
      continue;
    }

    if (OPS_LECTURA.has(c.op)) {
      const where = (args.where ?? {}) as Record<string, unknown>;
      if (where.tenantId !== TENANT) {
        problemas.push(
          `${c.model}.${c.op} sin where.tenantId=${TENANT} (where=${JSON.stringify(where).slice(0, 160)})`,
        );
      }
    }

    if (c.op === 'create' && !String(c.model).startsWith('connectivity')) {
      const data = (args.data ?? {}) as Record<string, unknown>;
      if (data.tenantId !== TENANT) {
        problemas.push(
          `${c.model}.create con data.tenantId=${String(data.tenantId)} en vez de ${TENANT}`,
        );
      }
    }
  }

  return { deTenant, problemas };
}

beforeEach(() => {
  calls.length = 0;
});

describe('Hospitality — ninguna consulta sin el tenant de la sesión', () => {
  const lecturas: Array<[string, () => Promise<Response>]> = [
    ['properties', () => getProperties(req('properties')) as Promise<Response>],
    ['units', () => getUnits(req('units')) as Promise<Response>],
    ['reservations', () => getReservations(req('reservations')) as Promise<Response>],
    ['rateplans', () => getRateplans(req('rateplans')) as Promise<Response>],
    ['guests', () => getGuests(req('guests')) as Promise<Response>],
    ['blocks', () => getBlocks(req('blocks')) as Promise<Response>],
    ['dashboard', () => getDashboard(req('dashboard')) as Promise<Response>],
    ['finanzas', () => getFinanzas(req('finanzas')) as Promise<Response>],
    ['operations', () => getOperations(req('operations')) as Promise<Response>],
    ['incidencias', () => getIncidencias(req('incidencias')) as Promise<Response>],
  ];

  for (const [nombre, invocar] of lecturas) {
    it(`GET ${nombre}: toda lectura lleva where.tenantId y ignora el tenantId ajeno del cliente`, async () => {
      await invocar().catch(() => undefined);

      const { deTenant, problemas } = auditar();
      expect(problemas).toEqual([]);
      // Sin consultas la prueba no demostraría nada: la ruta debe haber leído.
      expect(deTenant.length).toBeGreaterThan(0);
    });
  }

  it('POST properties/units/rateplans/blocks: crean con el tenant de la sesión, no con el del body', async () => {
    await postProperty(
      bodyReq('properties', { nombre: 'Propiedad del atacante' }),
    ).catch(() => undefined);
    await postUnit(
      bodyReq('units', { propertyId: 'prop_ajena', nombre: 'Unidad' }),
    ).catch(() => undefined);
    await postRateplan(
      bodyReq('rateplans', { unitId: 'unit_ajena', nombre: 'Tarifa' }),
    ).catch(() => undefined);
    await postBlock(
      bodyReq('blocks', { propertyId: 'prop_ajena', motivo: 'bloqueo' }),
    ).catch(() => undefined);

    const { problemas } = auditar();
    expect(problemas).toEqual([]);

    const creates = llamadasDeTenant().filter((c) => c.op === 'create');
    expect(creates.length).toBeGreaterThan(0);
    for (const c of creates) {
      expect(c.args.data.tenantId).toBe(TENANT);
    }
  });

  it('POST reservations: resuelve propiedad/unidad contra el tenant de la sesión', async () => {
    await postReservation(
      bodyReq('reservations', {
        propertyId: 'prop_ajena',
        unitId: 'unit_ajena',
        checkIn: '2027-01-10',
        checkOut: '2027-01-12',
        huespedNombre: 'Intruso',
        total: 100,
        moneda: 'EUR',
      }),
    ).catch(() => undefined);

    const { problemas } = auditar();
    expect(problemas).toEqual([]);
  });

  it('POST sync: no empuja a la capa usando datos de otra cuenta', async () => {
    await postSync(bodyReq('sync', { propertyId: 'prop_ajena' })).catch(() => undefined);

    const { problemas } = auditar();
    expect(problemas).toEqual([]);
  });
});
