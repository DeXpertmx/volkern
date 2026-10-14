import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests de planes de tarifa y restricciones de venta (plan maestro §6, §15):
 *   - GET/POST /api/hospitality/rateplans
 *   - PATCH/DELETE /api/hospitality/rateplans/[id]
 *   - buildRateUpdates usa los rate plans activos de la unidad
 */

const mockAuth = vi.hoisted(() => vi.fn());
const mockDispatch = vi.hoisted(() => vi.fn());
const prisma = vi.hoisted(() => ({
  hospitalityRatePlan: { findMany: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), findFirst: vi.fn() },
  hospitalityUnit: { findFirst: vi.fn() },
  hospitalityProperty: { findFirst: vi.fn() },
}));

vi.mock('@/lib/db', () => ({ prisma }));
vi.mock('@/lib/api-key-auth', () => ({
  authenticateRequest: (...a: any[]) => mockAuth(...a),
}));
vi.mock('@/lib/hospitality/sync', () => ({
  dispatchConnectivityPush: (...a: any[]) => mockDispatch(...a),
}));

import { GET as GETPlans, POST as POSTPlans } from '../app/api/hospitality/rateplans/route';
import { PATCH as PATCHPlan, DELETE as DELETPlan } from '../app/api/hospitality/rateplans/[id]/route';

const AUTH_OK = { valid: true, tenant: { id: 't1' }, user: { id: 'u1', role: { id: 'role_test', nombre: 'Superadmin', permisos: { all: true } } } };

function buildReq(body?: any, url = 'https://volkern.app/api/hospitality/rateplans') {
  return new Request(url, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  }) as any;
}

function makePlan(overrides: any = {}) {
  return {
    id: overrides.id || 'rp1',
    tenantId: 't1',
    propertyId: 'p1',
    unitId: 'u1',
    nombre: 'Tarifa estándar',
    codigo: null,
    tarifa: 2500,
    moneda: 'MXN',
    minNoches: 1,
    maxNoches: null,
    checkInDias: null,
    checkOutDias: null,
    activo: true,
    unit: { id: 'u1', nombre: 'Suite Océano', codigo: 'SO-1' },
    property: { id: 'p1', nombre: 'Villa Mar' },
    ...overrides,
  };
}

describe('GET /api/hospitality/rateplans', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue(AUTH_OK);
    prisma.hospitalityRatePlan.findMany.mockResolvedValue([makePlan()]);
  });

  it('autenticación inválida → 401', async () => {
    mockAuth.mockResolvedValue({ valid: false, error: 'no auth' });
    const res = await GETPlans(buildReq());
    expect(res.status).toBe(401);
  });

  it('lista planes filtrando por tenantId', async () => {
    const res = await GETPlans(buildReq());
    expect(res.status).toBe(200);
    const d = await res.json();
    expect(d.ratePlans).toHaveLength(1);
    const where = prisma.hospitalityRatePlan.findMany.mock.calls[0][0].where;
    expect(where.tenantId).toBe('t1');
  });

  it('filtra por unitId y activo', async () => {
    await GETPlans(buildReq(undefined, 'https://volkern.app/api/hospitality/rateplans?unitId=u9&activo=true'));
    const where = prisma.hospitalityRatePlan.findMany.mock.calls[0][0].where;
    expect(where.unitId).toBe('u9');
    expect(where.activo).toBe(true);
  });
});

describe('POST /api/hospitality/rateplans', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue(AUTH_OK);
    prisma.hospitalityUnit.findFirst.mockResolvedValue({ id: 'u1' });
    prisma.hospitalityRatePlan.create.mockImplementation(({ data }: any) =>
      Promise.resolve(makePlan({ ...data, id: 'rp-nuevo' }))
    );
    mockDispatch.mockResolvedValue({ ok: true });
  });

  it('autenticación inválida → 401', async () => {
    mockAuth.mockResolvedValue({ valid: false, error: 'no auth' });
    const res = await POSTPlans(buildReq({ propertyId: 'p1', unitId: 'u1', nombre: 'X', tarifa: 100 }));
    expect(res.status).toBe(401);
  });

  it('valida campos obligatorios', async () => {
    const res = await POSTPlans(buildReq({ propertyId: 'p1', unitId: 'u1' }));
    expect(res.status).toBe(400);
  });

  it('rechaza tarifa no positiva', async () => {
    const res = await POSTPlans(buildReq({ propertyId: 'p1', unitId: 'u1', nombre: 'X', tarifa: -5 }));
    expect(res.status).toBe(400);
  });

  it('rechaza unidad de otro tenant', async () => {
    prisma.hospitalityUnit.findFirst.mockResolvedValue(null);
    const res = await POSTPlans(buildReq({ propertyId: 'p1', unitId: 'u-otro', nombre: 'X', tarifa: 100 }));
    expect(res.status).toBe(404);
  });

  it('crea el plan y dispara el push de tarifas', async () => {
    const res = await POSTPlans(buildReq({
      propertyId: 'p1', unitId: 'u1', nombre: 'Tarifa fin de semana',
      tarifa: 3200, moneda: 'MXN', minNoches: 2, maxNoches: 4,
      checkInDias: [5, 6], checkOutDias: [0, 1], activo: true,
    }));
    expect(res.status).toBe(201);
    const createData = prisma.hospitalityRatePlan.create.mock.calls[0][0].data;
    expect(createData.tenantId).toBe('t1');
    expect(createData.nombre).toBe('Tarifa fin de semana');
    expect(createData.tarifa).toBe(3200);
    expect(createData.minNoches).toBe(2);
    expect(createData.maxNoches).toBe(4);
    expect(createData.checkInDias).toEqual([5, 6]);
    expect(createData.checkOutDias).toEqual([0, 1]);
    // Push disparado hacia la capa de conectividad
    expect(mockDispatch).toHaveBeenCalledWith('t1', 'p1', 'manual', { diasHorizonte: 180 });
  });

  it('guarda las reglas de una temporada ya normalizadas (texto del UI incluido)', async () => {
    const res = await POSTPlans(buildReq({
      propertyId: 'p1', unitId: 'u1', nombre: 'Verano', tarifa: 100,
      temporadas: [
        {
          desde: '2026-07-01', hasta: '2026-07-31', tarifa: 150,
          minNoches: '3', maxNoches: '7', checkInDias: [6], checkOutDias: ['0'], nombre: 'Verano',
        },
        { desde: '2026-08-01', hasta: '2026-08-31', tarifa: 180 },
      ],
    }));
    expect(res.status).toBe(201);
    const createData = prisma.hospitalityRatePlan.create.mock.calls[0][0].data;
    expect(createData.temporadas).toEqual([
      {
        desde: '2026-07-01', hasta: '2026-07-31', tarifa: 150,
        minNoches: 3, maxNoches: 7, checkInDias: [6], checkOutDias: [0], nombre: 'Verano',
      },
      { desde: '2026-08-01', hasta: '2026-08-31', tarifa: 180 },
    ]);
  });

  it('rechaza reglas inválidas de temporada en vez de descartarlas en silencio', async () => {
    const conMinimo = await POSTPlans(buildReq({
      propertyId: 'p1', unitId: 'u1', nombre: 'Verano', tarifa: 100,
      temporadas: [{ desde: '2026-07-01', hasta: '2026-07-31', tarifa: 150, minNoches: 'tres' }],
    }));
    expect(conMinimo.status).toBe(400);
    expect((await conMinimo.json()).error).toContain('mínimo de noches');

    // Un máximo por debajo del mínimo es una temporada invendible: se avisa.
    const imposible = await POSTPlans(buildReq({
      propertyId: 'p1', unitId: 'u1', nombre: 'Verano', tarifa: 100,
      temporadas: [{ desde: '2026-07-01', hasta: '2026-07-31', tarifa: 150, minNoches: 5, maxNoches: 2 }],
    }));
    expect(imposible.status).toBe(400);
    expect((await imposible.json()).error).toContain('no puede ser menor');

    // Y unos días fuera de 0-6, también.
    const diasMalos = await POSTPlans(buildReq({
      propertyId: 'p1', unitId: 'u1', nombre: 'Verano', tarifa: 100,
      temporadas: [{ desde: '2026-07-01', hasta: '2026-07-31', tarifa: 150, checkInDias: [7] }],
    }));
    expect(diasMalos.status).toBe(400);
    expect((await diasMalos.json()).error).toContain('entrada');

    expect(prisma.hospitalityRatePlan.create).not.toHaveBeenCalled();
  });
});

describe('PATCH /api/hospitality/rateplans/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue(AUTH_OK);
    prisma.hospitalityRatePlan.findFirst.mockResolvedValue({ id: 'rp1', propertyId: 'p1' });
    prisma.hospitalityRatePlan.update.mockImplementation(({ data }: any) =>
      Promise.resolve(makePlan({ ...data }))
    );
  });

  it('404 si el plan no es del tenant', async () => {
    prisma.hospitalityRatePlan.findFirst.mockResolvedValue(null);
    const res = await PATCHPlan(buildReq({ tarifa: 999 }), { params: Promise.resolve({ id: 'rp-otro' }) });
    expect(res.status).toBe(404);
  });

  it('actualiza tarifa y restricciones, y dispara el push', async () => {
    const res = await PATCHPlan(buildReq({ tarifa: 4100, minNoches: 3, checkInDias: [1, 4] }), {
      params: Promise.resolve({ id: 'rp1' }),
    });
    expect(res.status).toBe(200);
    const updateData = prisma.hospitalityRatePlan.update.mock.calls[0][0].data;
    expect(updateData.tarifa).toBe(4100);
    expect(updateData.minNoches).toBe(3);
    expect(updateData.checkInDias).toEqual([1, 4]);
    expect(mockDispatch).toHaveBeenCalledWith('t1', 'p1', 'manual', { diasHorizonte: 180 });
  });

  it('rechaza tarifa inválida en PATCH', async () => {
    const res = await PATCHPlan(buildReq({ tarifa: 'abc' }), { params: Promise.resolve({ id: 'rp1' }) });
    expect(res.status).toBe(400);
  });

  it('rechaza reglas de temporada inválidas y no actualiza nada', async () => {
    const minInvalido = await PATCHPlan(
      buildReq({
        temporadas: [{ desde: '2026-07-01', hasta: '2026-07-31', tarifa: 150, minNoches: 400 }],
      }),
      { params: Promise.resolve({ id: 'rp1' }) }
    );
    expect(minInvalido.status).toBe(400);

    const maxSinSentido = await PATCHPlan(
      buildReq({
        temporadas: [{ desde: '2026-07-01', hasta: '2026-07-31', tarifa: 150, minNoches: 4, maxNoches: 3 }],
      }),
      { params: Promise.resolve({ id: 'rp1' }) }
    );
    expect(maxSinSentido.status).toBe(400);
    expect((await maxSinSentido.json()).error).toContain('no puede ser menor');
    expect(prisma.hospitalityRatePlan.update).not.toHaveBeenCalled();
  });

  it('guarda las reglas de temporada y limpia la capa con una lista vacía', async () => {
    const conReglas = await PATCHPlan(
      buildReq({
        temporadas: [
          {
            desde: '2026-07-01', hasta: '2026-07-31', tarifa: 150,
            minNoches: 3, maxNoches: 7, checkOutDias: [0],
          },
        ],
      }),
      { params: Promise.resolve({ id: 'rp1' }) }
    );
    expect(conReglas.status).toBe(200);
    expect(prisma.hospitalityRatePlan.update.mock.calls[0][0].data.temporadas).toEqual([
      {
        desde: '2026-07-01', hasta: '2026-07-31', tarifa: 150,
        minNoches: 3, maxNoches: 7, checkOutDias: [0],
      },
    ]);

    vi.clearAllMocks();
    mockAuth.mockResolvedValue(AUTH_OK);
    prisma.hospitalityRatePlan.findFirst.mockResolvedValue({ id: 'rp1', propertyId: 'p1' });
    prisma.hospitalityRatePlan.update.mockImplementation(({ data }: any) =>
      Promise.resolve(makePlan({ ...data }))
    );
    const limpio = await PATCHPlan(buildReq({ temporadas: [] }), {
      params: Promise.resolve({ id: 'rp1' }),
    });
    expect(limpio.status).toBe(200);
    expect(prisma.hospitalityRatePlan.update.mock.calls[0][0].data.temporadas).toBeNull();
  });
});

describe('DELETE /api/hospitality/rateplans/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue(AUTH_OK);
    prisma.hospitalityRatePlan.findFirst.mockResolvedValue({ id: 'rp1', propertyId: 'p1' });
    prisma.hospitalityRatePlan.delete.mockResolvedValue({ id: 'rp1' });
  });

  it('elimina y re-empuja tarifas', async () => {
    const res = await DELETPlan(buildReq(), { params: Promise.resolve({ id: 'rp1' }) });
    expect(res.status).toBe(200);
    expect(prisma.hospitalityRatePlan.delete).toHaveBeenCalledWith({ where: { id: 'rp1' } });
    expect(mockDispatch).toHaveBeenCalledWith('t1', 'p1', 'manual', { diasHorizonte: 180 });
  });
});