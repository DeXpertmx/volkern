// @vitest-environment node

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  tenantFindUnique: vi.fn(),
  subscriptionPlanFindUnique: vi.fn(),
  userFindFirst: vi.fn(),
  shipmentFindFirst: vi.fn(),
  shipmentFindMany: vi.fn(),
  salesOrderFindFirst: vi.fn(),
  stockLevelsFindMany: vi.fn(),
  fleetVehiclesFindMany: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    tenant: { findUnique: mocks.tenantFindUnique },
    subscriptionPlan: { findUnique: mocks.subscriptionPlanFindUnique },
    user: { findFirst: mocks.userFindFirst },
    erp_shipments: {
      findFirst: mocks.shipmentFindFirst,
      findMany: mocks.shipmentFindMany,
    },
    salesOrder: { findFirst: mocks.salesOrderFindFirst },
    erp_stock_levels: { findMany: mocks.stockLevelsFindMany },
    erp_fleet_vehicles: { findMany: mocks.fleetVehiclesFindMany },
  },
}));

vi.mock('@/lib/skills/event-bus', () => ({
  eventBus: { emitEvent: vi.fn() },
  EVENTS: {},
}));

const { logisticsIntents } = await import('@/lib/agents/intents/logistics-intents');
const { SkillOrchestratorAgent } = await import('@/lib/agents/skill-orchestrator');
const { skills } = await import('@/lib/skills');
const { ExecutionEngine } = await import('@/lib/agents/execution-engine');

const TENANT = 'tenant-1';

// Tenant con plan 'premium' + override tenantFeature logistica habilitado
// (logistica NO está en el fallback esencial de PLAN_MODULES, así que se
// activa explícitamente como hace el signup con el módulo del plan).
const TENANT_FIXTURE = {
  id: TENANT,
  plan: 'premium',
  tenantFeatures: [{ feature: 'logistica', habilitado: true }],
};

const SHIPMENT_FIXTURE = {
  id: 'ship-1',
  batchNumber: 'ORD-456',
  status: 'SHIPPED',
  carrier: 'SEUR',
  trackingNumber: 'TRK-12345',
  dispatchedAt: new Date('2026-07-01T10:00:00.000Z'),
  deliveredAt: null,
  receiverName: 'Ana',
  estimatedDelivery: new Date('2026-07-05T00:00:00.000Z'),
  erp_sales_orders: {
    batchNumber: 'ORD-456',
    grandTotal: 1200,
    customer: { name: 'Juan Pérez' },
  },
  erp_delivery_confirmations: [],
};

const VEHICLES = [
  { id: 'v-1', plate: '1234ABC', brand: 'Mercedes', model: 'Sprinter', status: 'ACTIVE', currentKm: 100 },
  { id: 'v-2', plate: '5678DEF', brand: 'Iveco', model: 'Daily', status: 'MAINTENANCE', currentKm: 200 },
  {
    id: 'v-3',
    plate: '9012GHI',
    brand: 'Ford',
    model: 'Transit',
    status: 'ACTIVE',
    currentKm: 300,
    itvExpiration: new Date(Date.now() + 10 * 24 * 3600 * 1000),
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.tenantFindUnique.mockResolvedValue(TENANT_FIXTURE as any);
  mocks.subscriptionPlanFindUnique.mockResolvedValue(null); // → fallback PLAN_MODULES
  mocks.userFindFirst.mockResolvedValue({ id: 'user-1' } as any);
});

// ─── 1. Intents registrados ─────────────────────────────────────────────────

describe('logistics-intents', () => {
  it('registra los 7 intents de logística', () => {
    const names = logisticsIntents.map(i => i.name);
    expect(names).toContain('estado_envio');
    expect(names).toContain('rastrear_pedido');
    expect(names).toContain('tracking_envio');
    expect(names).toContain('salud_flota');
    expect(names).toContain('estado_flota');
    expect(names).toContain('optimizar_ruta');
    expect(names).toContain('reorganizar_almacen');
  });

  it('estado_envio exige tracking; rastrear_pedido exige pedidoId; flota sin requeridos', () => {
    const estado = logisticsIntents.find(i => i.name === 'estado_envio')!;
    const rastrear = logisticsIntents.find(i => i.name === 'rastrear_pedido')!;
    const salud = logisticsIntents.find(i => i.name === 'salud_flota')!;
    expect(estado.requiredParams).toEqual(['tracking']);
    expect(rastrear.requiredParams).toEqual(['pedidoId']);
    expect(salud.requiredParams).toEqual([]);
    expect(salud.optionalParams).toContain('vehiculoId');
  });

  it('ningún intent de logística es destructive', () => {
    for (const intent of logisticsIntents) {
      expect(intent.destructive).toBe(false);
    }
  });
});

// ─── 2. Mapping orchestrator: intent → skill ───────────────────────────────

describe('SkillOrchestrator — wiring de logística', () => {
  const ctx = {
    tenantId: TENANT,
    userId: 'user-1',
    pendingIntent: '',
    collectedEntities: {},
    missingEntities: [],
  };

  it('estado_envio → get_shipment_status', async () => {
    const result = await SkillOrchestratorAgent.createPlan(
      { intent: 'estado_envio', entities: { tracking: 'TRK-12345' }, missingEntities: [] },
      ctx,
      TENANT,
    );
    expect(result.success).toBe(true);
    expect(result.plan?.steps[0].action).toBe('get_shipment_status');
    expect(result.plan?.steps[0].params).toMatchObject({ tenantId: TENANT, tracking: 'TRK-12345' });
  });

  it('rastrear_pedido → track_order', async () => {
    const result = await SkillOrchestratorAgent.createPlan(
      { intent: 'rastrear_pedido', entities: { pedidoId: 'ORD-456' }, missingEntities: [] },
      ctx,
      TENANT,
    );
    expect(result.plan?.steps[0].action).toBe('track_order');
  });

  it('salud_flota y estado_flota → check_fleet_health', async () => {
    const a = await SkillOrchestratorAgent.createPlan(
      { intent: 'salud_flota', entities: {}, missingEntities: [] },
      ctx,
      TENANT,
    );
    const b = await SkillOrchestratorAgent.createPlan(
      { intent: 'estado_flota', entities: { vehiculoId: 'VEH-001' }, missingEntities: [] },
      ctx,
      TENANT,
    );
    expect(a.plan?.steps[0].action).toBe('check_fleet_health');
    expect(b.plan?.steps[0].action).toBe('check_fleet_health');
  });

  it('optimizar_ruta → optimize_route y reorganizar_almacen → suggest_warehouse_reorg', async () => {
    const a = await SkillOrchestratorAgent.createPlan(
      { intent: 'optimizar_ruta', entities: { fecha: '2026-08-12' }, missingEntities: [] },
      ctx,
      TENANT,
    );
    const b = await SkillOrchestratorAgent.createPlan(
      { intent: 'reorganizar_almacen', entities: { almacenId: 'principal' }, missingEntities: [] },
      ctx,
      TENANT,
    );
    expect(a.plan?.steps[0].action).toBe('optimize_route');
    expect(b.plan?.steps[0].action).toBe('suggest_warehouse_reorg');
  });

  it('sin acceso al módulo logistica devuelve el mensaje de no acceso', async () => {
    mocks.tenantFindUnique.mockResolvedValue({ id: TENANT, plan: 'basico', tenantFeatures: [] } as any);
    const result = await SkillOrchestratorAgent.createPlan(
      { intent: 'estado_envio', entities: { tracking: 'TRK-1' }, missingEntities: [] },
      ctx,
      TENANT,
    );
    expect(result.response).toContain('Logística');
  });
});

// ─── 3. Wrappers de skills (mapeo de nombres ES → params del core) ─────────

describe('skills — logística', () => {
  it('get_shipment_status mapea tracking → trackingNumber', async () => {
    mocks.shipmentFindFirst.mockResolvedValue(SHIPMENT_FIXTURE as any);

    const result = await (skills as any).get_shipment_status({ tenantId: TENANT, tracking: 'TRK-12345' });

    expect(mocks.shipmentFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: TENANT, trackingNumber: 'TRK-12345' },
      }),
    );
    expect(result.found).toBe(true);
    expect(result.shipment.trackingNumber).toBe('TRK-12345');
    expect(result.shipment.status).toBe('SHIPPED');
    expect(result.shipment.customerName).toBe('Juan Pérez');
  });

  it('get_shipment_status sin trackingNumber devuelve not-found del skill', async () => {
    mocks.shipmentFindFirst.mockResolvedValue(null);

    const result = await (skills as any).get_shipment_status({ tenantId: TENANT, tracking: 'TRK-999' });

    expect(result.found).toBe(false);
    expect(result.message).toContain('No se encontró');
  });

  it('track_order mapea pedidoId → orderRef (resuelve salesOrder por batchNumber)', async () => {
    mocks.salesOrderFindFirst.mockResolvedValue({ id: 'so-1' } as any);
    mocks.shipmentFindFirst.mockResolvedValue({
      id: 'ship-1',
      status: 'DELIVERED',
      carrier: 'DHL',
      trackingNumber: 'TRK-111',
      dispatchedAt: new Date('2026-07-01'),
      deliveredAt: new Date('2026-07-03'),
      receiverName: 'Ana',
      erp_delivery_confirmations: [],
    } as any);

    const result = await (skills as any).track_order({ tenantId: TENANT, pedidoId: 'ORD-456' });

    expect(mocks.salesOrderFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId: TENANT, batchNumber: 'ORD-456' } }),
    );
    expect(result.found).toBe(true);
    expect(result.status).toBe('DELIVERED');
    expect(result.timeline).toHaveLength(3);
  });

  it('check_fleet_health resume mantenimientos e ITVs desde la flota', async () => {
    mocks.fleetVehiclesFindMany.mockResolvedValue(VEHICLES as any);

    const result = await (skills as any).check_fleet_health({ tenantId: TENANT });

    expect(result.kpis.active).toBe(2);
    expect(result.kpis.total).toBe(3);
    expect(result.maintenanceDue).toHaveLength(1);
    expect(result.maintenanceDue[0].plate).toBe('5678DEF');
    expect(result.expiringItv).toHaveLength(1);
    expect(result.expiringItv[0].plate).toBe('9012GHI');
  });

  it('check_fleet_health filtra por vehículo (matrícula) cuando se pide', async () => {
    mocks.fleetVehiclesFindMany.mockResolvedValue(VEHICLES as any);

    const result = await (skills as any).check_fleet_health({ tenantId: TENANT, vehiculoId: '5678DEF' });

    expect(result.maintenanceDue).toHaveLength(1);
    expect(result.maintenanceDue[0].plate).toBe('5678DEF');
    expect(result.expiringItv).toHaveLength(0);

    const none = await (skills as any).check_fleet_health({ tenantId: TENANT, vehiculoId: 'XXXX' });
    expect(none.message).toContain('No encontré el vehículo');
  });

  it('optimize_route agrupa destinos de envíos pendientes', async () => {
    mocks.shipmentFindMany.mockResolvedValue([
      { id: 's1', status: 'PREPARING', erp_sales_orders: { batchNumber: 'ORD-1', deliveryAddress: 'Calle A', city: 'Madrid' } },
      { id: 's2', status: 'PREPARING', erp_sales_orders: { batchNumber: 'ORD-2', deliveryAddress: 'Calle B', city: 'Barcelona' } },
    ] as any);

    const result = await (skills as any).optimize_route({ tenantId: TENANT });

    expect(result.pendingCount).toBe(2);
    expect(result.destinations).toEqual(['Calle A', 'Calle B']);
    expect(result.suggestion).toContain('2 envíos pendientes');
  });

  it('suggest_warehouse_reorg mapea almacenId → warehouseId', async () => {
    mocks.stockLevelsFindMany.mockResolvedValue([
      { quantity: 5, catalogoItem: { nombre: 'Cafetera', sku: 'CAF-1' }, warehouse: { name: 'Principal' } },
      { quantity: 80, catalogoItem: { nombre: 'Caja', sku: 'CAJ-1' }, warehouse: { name: 'Principal' } },
    ] as any);

    const result = await (skills as any).suggest_warehouse_reorg({ tenantId: TENANT, almacenId: 'principal' });

    expect(mocks.stockLevelsFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: TENANT, warehouseId: 'principal' },
      }),
    );
    expect(result.highRotationItems).toHaveLength(1);
    expect(result.lowRotationItems).toHaveLength(1);
  });
});

// ─── 4. Formateadores del ExecutionEngine ───────────────────────────────────

describe('ExecutionEngine.formatSkillResult — logística', () => {
  it('get_shipment_status formatea envío con estado, carrier y cliente', () => {
    const msg = ExecutionEngine.formatSkillResult('get_shipment_status', {
      found: true,
      shipment: {
        trackingNumber: 'TRK-12345',
        status: 'SHIPPED',
        carrier: 'SEUR',
        customerName: 'Juan Pérez',
        estimatedDelivery: '2026-07-05T00:00:00.000Z',
      },
    });
    const plain = msg.replace(/\\/g, '');
    expect(plain).toContain('Envío TRK-12345');
    expect(plain).toContain('SHIPPED');
    expect(plain).toContain('SEUR');
    expect(plain).toContain('Juan Pérez');
  });

  it('get_shipment_status not-found muestra el mensaje del skill', () => {
    const msg = ExecutionEngine.formatSkillResult('get_shipment_status', {
      found: false,
      message: 'No se encontró ningún envío con esos datos.',
    });
    expect(msg).toContain('No se encontró ningún envío');
  });

  it('track_order formatea el timeline con estados completados', () => {
    const msg = ExecutionEngine.formatSkillResult('track_order', {
      found: true,
      status: 'DELIVERED',
      carrier: 'DHL',
      receiver: 'Ana',
      timeline: [
        { event: 'Despachado', date: '2026-07-01T00:00:00.000Z', done: true },
        { event: 'En tránsito', date: null, done: true },
        { event: 'Entregado', date: '2026-07-03T00:00:00.000Z', done: true },
      ],
    });
    const plain = msg.replace(/\\/g, '');
    expect(plain).toContain('Pedido');
    expect(plain).toContain('DELIVERED');
    expect(plain).toContain('✅ Despachado');
    expect(plain).toContain('✅ Entregado');
  });

  it('check_fleet_health formatea activos, mantenimientos e ITVs', () => {
    const msg = ExecutionEngine.formatSkillResult('check_fleet_health', {
      kpis: { active: 2, total: 3 },
      maintenanceDue: [{ plate: '5678DEF', brand: 'Iveco', model: 'Daily' }],
      expiringItv: [{ plate: '9012GHI', daysLeft: 10 }],
    });
    const plain = msg.replace(/\\/g, '');
    expect(plain).toContain('Flota');
    expect(plain).toContain('2 de 3');
    expect(plain).toContain('5678DEF');
    expect(plain).toContain('ITV próximas a vencer');
  });

  it('check_fleet_health con filtro sin resultados muestra el mensaje', () => {
    const msg = ExecutionEngine.formatSkillResult('check_fleet_health', {
      message: 'No encontré el vehículo "XXXX" con mantenimientos pendientes ni ITV próxima a vencer.',
    });
    expect(msg).toContain('No encontré el vehículo');
  });

  it('optimize_route y suggest_warehouse_reorg muestran la sugerencia del skill', () => {
    const ruta = ExecutionEngine.formatSkillResult('optimize_route', {
      suggestion: 'Hay 2 envíos pendientes. Destinos sugeridos: Calle A, Calle B.',
    });
    expect(ruta).toContain('2 envíos pendientes');

    const almacen = ExecutionEngine.formatSkillResult('suggest_warehouse_reorg', {
      suggestion: 'Se detectaron 1 productos de alta rotación.',
    });
    expect(almacen).toContain('alta rotación');
  });
});
