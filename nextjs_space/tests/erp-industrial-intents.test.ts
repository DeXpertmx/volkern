// @vitest-environment node

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  tenantFindUnique: vi.fn(),
  subscriptionPlanFindUnique: vi.fn(),
  userFindFirst: vi.fn(),
  catalogoItemFindFirst: vi.fn(),
  catalogoItemFindUnique: vi.fn(),
  billOfMaterialsFindFirst: vi.fn(),
  billOfMaterialsFindUnique: vi.fn(),
  workOrderFindFirst: vi.fn(),
  workOrderFindUnique: vi.fn(),
  qualityPointFindFirst: vi.fn(),
  qualityPointCreate: vi.fn(),
  qualityCheckCreate: vi.fn(),
  nonConformityCreate: vi.fn(),
  nonConformityFindMany: vi.fn(),
  projectFindFirst: vi.fn(),
  projectFindMany: vi.fn(),
  projectFindUnique: vi.fn(),
  expenseAggregate: vi.fn(),
  stockMovementFindMany: vi.fn(),
  stockLevelFindMany: vi.fn(),
  analyzeScrapEvidence: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    tenant: { findUnique: mocks.tenantFindUnique },
    subscriptionPlan: { findUnique: mocks.subscriptionPlanFindUnique },
    user: { findFirst: mocks.userFindFirst },
    catalogoItem: { findFirst: mocks.catalogoItemFindFirst, findUnique: mocks.catalogoItemFindUnique },
    billOfMaterials: { findFirst: mocks.billOfMaterialsFindFirst, findUnique: mocks.billOfMaterialsFindUnique },
    workOrder: { findFirst: mocks.workOrderFindFirst, findUnique: mocks.workOrderFindUnique },
    qualityPoint: { findFirst: mocks.qualityPointFindFirst, create: mocks.qualityPointCreate },
    qualityCheck: { create: mocks.qualityCheckCreate },
    nonConformity: { create: mocks.nonConformityCreate, findMany: mocks.nonConformityFindMany },
    project: { findFirst: mocks.projectFindFirst, findMany: mocks.projectFindMany, findUnique: mocks.projectFindUnique },
    expense: { aggregate: mocks.expenseAggregate },
    stockMovement: { findMany: mocks.stockMovementFindMany },
    stockLevel: { findMany: mocks.stockLevelFindMany },
  },
}));

vi.mock('@/lib/skills/event-bus', () => ({
  eventBus: { emitEvent: vi.fn() },
  EVENTS: {},
}));

vi.mock('@/lib/ai/vision-service', () => ({
  VisionService: { analyzeScrapEvidence: mocks.analyzeScrapEvidence },
}));

const { erpIntents } = await import('@/lib/agents/intents/erp-intents');
const { SkillOrchestratorAgent } = await import('@/lib/agents/skill-orchestrator');
const { skills } = await import('@/lib/skills');
const { ExecutionEngine } = await import('@/lib/agents/execution-engine');

const TENANT = 'tenant-1';

const TENANT_FIXTURE = { id: TENANT, plan: 'premium', tenantFeatures: [] };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.tenantFindUnique.mockResolvedValue(TENANT_FIXTURE as any);
  mocks.subscriptionPlanFindUnique.mockResolvedValue(null); // → fallback PLAN_MODULES
  mocks.userFindFirst.mockResolvedValue({ id: 'user-1' } as any);
  mocks.catalogoItemFindFirst.mockResolvedValue({ id: 'item-1', nombre: 'Panel Solar 400W', sku: 'PS-400' } as any);
  mocks.billOfMaterialsFindFirst.mockResolvedValue({ id: 'bom-1' } as any);
  mocks.billOfMaterialsFindUnique.mockResolvedValue({
    id: 'bom-1',
    productId: 'item-1',
    catalogoItem: { nombre: 'Panel Solar 400W' },
    components: [{ itemId: 'comp-1', quantity: 2 }],
  } as any);
  mocks.catalogoItemFindUnique.mockResolvedValue({ id: 'comp-1', precioBase: 50 } as any);
  mocks.workOrderFindFirst.mockResolvedValue({ id: 'wo-1' } as any);
  mocks.workOrderFindUnique.mockResolvedValue({
    id: 'wo-1',
    bom: { components: [{ itemId: 'comp-1' }] },
  } as any);
  mocks.analyzeScrapEvidence.mockResolvedValue({
    riskLevel: 'HIGH',
    verdict: 'Evidencia insuficiente',
    rootCause: 'Daño por manipulación',
    correctiveAction: 'Recapturar evidencia',
    isRecapture: false,
  } as any);
  mocks.qualityPointFindFirst.mockResolvedValue(null);
  mocks.qualityPointCreate.mockResolvedValue({ id: 'point-1' } as any);
  mocks.qualityCheckCreate.mockResolvedValue({ id: 'qc-1', integrityHash: 'a'.repeat(64) } as any);
  mocks.nonConformityCreate.mockResolvedValue({ id: 'nc-1' } as any);
  mocks.nonConformityFindMany.mockResolvedValue([]);
  mocks.projectFindFirst.mockResolvedValue({ id: 'proj-1' } as any);
  mocks.projectFindMany.mockResolvedValue([{ id: 'proj-1' }, { id: 'proj-2' }] as any);
  mocks.projectFindUnique.mockResolvedValue({ id: 'proj-1', lead: null, milestones: [] } as any);
  mocks.expenseAggregate.mockResolvedValue({ _sum: { amount: 2000 } } as any);
  mocks.stockMovementFindMany.mockResolvedValue([]);
  mocks.stockLevelFindMany.mockResolvedValue([]);
});

// ─── 1. Intents registrados ─────────────────────────────────────────────────

describe('erp-intents — industrial', () => {
  it('registra los 7 intents de ERP industrial', () => {
    const names = erpIntents.map(i => i.name);
    for (const n of [
      'watchdog_inventario', 'calcular_costo_produccion', 'detectar_anomalias_calidad',
      'verificar_mermas', 'registrar_inspeccion_calidad', 'rentabilidad_proyecto',
      'desviaciones_proyecto',
    ]) {
      expect(names).toContain(n);
    }
  });

  it('los intents de escritura exigen sus refs', () => {
    const costo = erpIntents.find(i => i.name === 'calcular_costo_produccion')!;
    const merma = erpIntents.find(i => i.name === 'verificar_mermas')!;
    const qc = erpIntents.find(i => i.name === 'registrar_inspeccion_calidad')!;
    const rent = erpIntents.find(i => i.name === 'rentabilidad_proyecto')!;
    expect(costo.requiredParams).toContain('productoId');
    expect(merma.requiredParams).toContain('ordenProduccionId');
    expect(qc.requiredParams).toContain('resultado');
    expect(rent.requiredParams).toContain('proyectoId');
    expect(merma.destructive).toBe(false); // trazabilidad, no destruye
    expect(qc.destructive).toBe(false);
  });
});

// ─── 2. Mapping orchestrator: intent → skill ───────────────────────────────

describe('SkillOrchestrator — wiring de ERP industrial', () => {
  const ctx = {
    tenantId: TENANT,
    userId: 'user-1',
    pendingIntent: '',
    collectedEntities: {},
    missingEntities: [],
  };

  it('los 7 intents mapean a sus skills', async () => {
    const cases: Array<[string, Record<string, string>, string]> = [
      ['watchdog_inventario', {}, 'inventory_watchdog'],
      ['calcular_costo_produccion', { productoId: 'item-1' }, 'calculate_production_cost'],
      ['detectar_anomalias_calidad', {}, 'detect_quality_anomalies'],
      ['verificar_mermas', { ordenProduccionId: 'OP-001' }, 'verify_waste_integrity'],
      ['registrar_inspeccion_calidad', { productoId: 'item-1', resultado: 'PASSED' }, 'register_qc_inspection'],
      ['rentabilidad_proyecto', { proyectoId: 'proj-1' }, 'get_project_profitability'],
      ['desviaciones_proyecto', {}, 'detect_project_drifting'],
    ];
    for (const [intent, entities, skill] of cases) {
      const result = await SkillOrchestratorAgent.createPlan({ intent, entities, missingEntities: [] }, ctx, TENANT);
      expect(result.plan?.steps[0].action).toBe(skill);
    }
  });

  it('el módulo industrial NO está en el plan basico (no-access)', async () => {
    mocks.tenantFindUnique.mockResolvedValue({ id: TENANT, plan: 'basico', tenantFeatures: [] } as any);
    const result = await SkillOrchestratorAgent.createPlan(
      { intent: 'calcular_costo_produccion', entities: { productoId: 'item-1' }, missingEntities: [] },
      ctx,
      TENANT,
    );
    expect(result.response).toContain('Producción');
    expect(result.plan).toBeUndefined();
  });
});

// ─── 3. Wrappers de skills (resolución de refs ES → ids del core) ──────────

describe('skills — ERP industrial', () => {
  it('calculate_production_cost resuelve el producto por nombre y su BoM', async () => {
    const result = await (skills as any).calculate_production_cost({
      tenantId: TENANT,
      producto: 'panel solar',
      cantidad: 10,
    });
    expect(mocks.billOfMaterialsFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ tenantId: TENANT, productId: 'item-1' }) }),
    );
    // materialCost = 50 × 2 × 10 = 1000; labor = 15.5 × 10 = 155
    expect(result.totalCost).toBeCloseTo(1155, 2);
    expect(result.productName).toBe('Panel Solar 400W');
  });

  it('calculate_production_cost sin producto lanza error claro', async () => {
    await expect((skills as any).calculate_production_cost({ tenantId: TENANT })).rejects.toThrow('producto');
  });

  it('verify_waste_integrity resuelve la orden y ejecuta Vision-Lock', async () => {
    const result = await (skills as any).verify_waste_integrity({
      tenantId: TENANT,
      ordenProduccionId: 'OP-001',
      evidenciaUrl: 'https://cdn.example.com/merma.jpg',
    });
    expect(mocks.workOrderFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ tenantId: TENANT }) }),
    );
    expect(mocks.analyzeScrapEvidence).toHaveBeenCalled();
    expect(result.status).toBe('REJECTED');
    expect(result.imageAnalyzed).toBe('https://cdn.example.com/merma.jpg');
  });

  it('verify_waste_integrity sin foto pide la evidencia', async () => {
    await expect((skills as any).verify_waste_integrity({
      tenantId: TENANT,
      ordenProduccionId: 'OP-001',
    })).rejects.toThrow('foto');
  });

  it('register_qc_inspection resuelve producto → punto de control (o lo crea)', async () => {
    const result = await (skills as any).register_qc_inspection({
      tenantId: TENANT,
      producto: 'panel solar',
      resultado: 'aprobado',
      userId: 'user-1',
    });
    expect(mocks.qualityPointCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ tenantId: TENANT, name: 'Panel Solar 400W' }) }),
    );
    expect(mocks.qualityCheckCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ pointId: 'point-1', status: 'PASSED' }) }),
    );
    expect(result.integrityHash).toBeDefined();
  });

  it('register_qc_inspection con resultado rechazado genera No Conformidad', async () => {
    await (skills as any).register_qc_inspection({
      tenantId: TENANT,
      producto: 'panel solar',
      resultado: 'rechazado',
      userId: 'user-1',
    });
    expect(mocks.qualityCheckCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'FAILED' }) }),
    );
    expect(mocks.nonConformityCreate).toHaveBeenCalled();
  });

  it('get_project_profitability resuelve el proyecto por nombre', async () => {
    mocks.projectFindUnique.mockResolvedValue({
      id: 'proj-1',
      lead: { invoices: [{ monto: 10000 }] },
    } as any);
    mocks.stockMovementFindMany.mockResolvedValue([
      { quantity: 10, catalogoItem: { precioBase: 50 } },
    ] as any);
    const result = await (skills as any).get_project_profitability({
      tenantId: TENANT,
      proyecto: 'obra norte',
    });
    expect(mocks.projectFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ tenantId: TENANT }) }),
    );
    expect(result.totalIncome).toBe(10000);
    expect(result.materialCosts).toBe(500);
    expect(result.margin).toBeGreaterThan(0);
  });

  it('detect_project_drifting sin proyecto analiza todos los proyectos', async () => {
    const result = await (skills as any).detect_project_drifting({ tenantId: TENANT });
    expect(Array.isArray(result.projects)).toBe(true);
    expect(result.projects.length).toBe(2);
  });

  it('inventory_watchdog reporta inventario sano sin alertas', async () => {
    const result = await (skills as any).inventory_watchdog({ tenantId: TENANT });
    expect(result.status).toBe('OK');
  });
});

// ─── 4. Formatters de ExecutionEngine ───────────────────────────────────────

describe('ExecutionEngine.formatSkillResult — ERP industrial', () => {
  it('calculate_production_cost formatea costos', () => {
    const msg = ExecutionEngine.formatSkillResult('calculate_production_cost', {
      productName: 'Panel Solar 400W',
      quantity: 10,
      materialCost: 1000,
      laborCost: 155,
      totalCost: 1155,
      unitCost: 115.5,
    });
    expect(msg).toContain('Panel Solar 400W');
    expect(msg).toContain('1155');
  });

  it('detect_quality_anomalies formatea el reporte', () => {
    const msg = ExecutionEngine.formatSkillResult('detect_quality_anomalies', {
      status: 'ANOMALIES_DETECTED',
      data: { totalFailures: 4, topFailureSource: 'Materiales', supplierAlert: 'SolarTech +12%', recommendation: 'Inspeccionar', riskLevel: 'MEDIUM' },
    });
    expect(msg).toContain('4');
    expect(msg).toContain('SolarTech');
  });

  it('verify_waste_integrity formatea el veredicto', () => {
    const msg = ExecutionEngine.formatSkillResult('verify_waste_integrity', {
      status: 'REJECTED',
      verdict: 'Evidencia insuficiente',
      rootCause: 'Manipulación',
      correctiveAction: 'Recapturar',
    });
    expect(msg).toContain('RECHAZADA');
    expect(msg).toContain('Manipulación');
  });

  it('register_qc_inspection formatea el hash', () => {
    const msg = ExecutionEngine.formatSkillResult('register_qc_inspection', {
      integrityHash: 'a'.repeat(64),
      message: 'Inspección verificada',
    });
    expect(msg).toContain('Inspección de calidad registrada');
    expect(msg).toContain('SHA-256');
  });

  it('get_project_profitability formatea ingresos y margen', () => {
    const msg = ExecutionEngine.formatSkillResult('get_project_profitability', {
      totalIncome: 10000,
      totalExpenses: 2000,
      materialCosts: 500,
      netProfit: 7500,
      margin: 75,
      status: 'HEALTHY',
    });
    const plain = msg.replace(/\\/g, '');
    expect(plain).toContain('Rentabilidad del proyecto');
    expect(plain).toContain('10.000');
    expect(plain).toContain('75');
  });

  it('detect_project_drifting formatea las desviaciones', () => {
    const msg = ExecutionEngine.formatSkillResult('detect_project_drifting', {
      projects: [{ projectId: 'p1', driftLevel: 'HIGH', delayedMilestonesCount: 2, currentMargin: 5, recommendation: 'Revisa costos' }],
    });
    expect(msg).toContain('Desviaciones en proyectos');
    expect(msg).toContain('2 hitos retrasados');
  });

  it('inventory_watchdog formatea el estado sano', () => {
    const msg = ExecutionEngine.formatSkillResult('inventory_watchdog', { status: 'OK', message: 'Inventario saludable' });
    expect(msg).toContain('Inventario saludable');
  });
});
