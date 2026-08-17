// @vitest-environment node

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  userFindFirst: vi.fn(),
  userFindUnique: vi.fn(),
  tenantFindUnique: vi.fn(),
  subscriptionPlanFindUnique: vi.fn(),
  employeeFindFirst: vi.fn(),
  erpIndustrialAssetsFindUnique: vi.fn(),
  erpIndustrialAssetsFindFirst: vi.fn(),
  erpProductionLinesFindFirst: vi.fn(),
  attendanceFindMany: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findFirst: mocks.userFindFirst, findUnique: mocks.userFindUnique },
    tenant: { findUnique: mocks.tenantFindUnique },
    subscriptionPlan: { findUnique: mocks.subscriptionPlanFindUnique },
    employee: { findFirst: mocks.employeeFindFirst },
    attendance: { findMany: mocks.attendanceFindMany },
    erp_industrial_assets: {
      findUnique: mocks.erpIndustrialAssetsFindUnique,
      findFirst: mocks.erpIndustrialAssetsFindFirst,
    },
    erp_production_lines: { findFirst: mocks.erpProductionLinesFindFirst },
  },
}));

vi.mock('@/lib/skills/event-bus', () => ({
  eventBus: { emitEvent: vi.fn() },
  EVENTS: {},
}));

const { factoryIntents } = await import('@/lib/agents/intents/factory-intents');
const { IntentClassifierAgent } = await import('@/lib/agents/intent-classifier');
const { SkillOrchestratorAgent } = await import('@/lib/agents/skill-orchestrator');
const { skills } = await import('@/lib/skills');

const TENANT = 'tenant-1';
const TENANT_FIXTURE = { id: TENANT, plan: 'empresarial', tenantFeatures: [] };

function makeClassifier() {
  return new IntentClassifierAgent() as any;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.tenantFindUnique.mockResolvedValue(TENANT_FIXTURE as any);
  mocks.subscriptionPlanFindUnique.mockResolvedValue({ id: 'plan-1', name: 'empresarial' } as any);
  mocks.userFindFirst.mockResolvedValue({ id: 'user-1' } as any);
  mocks.employeeFindFirst.mockResolvedValue({ id: 'emp-1', fullName: 'Juan Pérez' } as any);
  mocks.erpIndustrialAssetsFindFirst.mockResolvedValue({ id: 'asset-1', name: 'Prensa S1' } as any);
  mocks.erpIndustrialAssetsFindUnique.mockResolvedValue({ id: 'asset-1', name: 'Prensa S1' } as any);
  mocks.erpProductionLinesFindFirst.mockResolvedValue({ id: 'line-1', name: 'Línea A' } as any);
  mocks.attendanceFindMany.mockResolvedValue([]);
});

// ─── 1. Intents registrados ─────────────────────────────────────────────────

describe('factory-intents — bloque 20 (fábrica avanzada)', () => {
  it('registra los 11 intents nuevos', () => {
    const names = factoryIntents.map(i => i.name);
    for (const n of [
      'ejecutar_nomina', 'anomalias_asistencia', 'predecir_fallo_activo',
      'dashboard_mantenimiento', 'proyeccion_capacidad', 'simular_escenario_produccion',
      'readiness_produccion', 'plan_compras', 'optimizar_secuenciacion',
      'maximizar_rentabilidad_scheduling', 'rentabilidad_produccion',
    ]) {
      expect(names).toContain(n);
    }
    expect(factoryIntents.length).toBe(11);
  });

  it('los intents de escritura exigen sus refs', () => {
    const nomina = factoryIntents.find(i => i.name === 'ejecutar_nomina')!;
    const fallo = factoryIntents.find(i => i.name === 'predecir_fallo_activo')!;
    const sim = factoryIntents.find(i => i.name === 'simular_escenario_produccion')!;
    expect(nomina.requiredParams).toContain('empleado');
    expect(fallo.requiredParams).toContain('activo');
    expect(sim.requiredParams).toContain('unidades');
  });
});

// ─── 2. Detección determinista (sin LLM) ───────────────────────────────────

describe('IntentClassifier — bloque fábrica avanzada (determinista)', () => {
  const classifier = makeClassifier();
  const base = {
    message: '',
    userId: 'user-1',
    tenantId: TENANT,
  };

  it('detecta ejecutar_nomina con empleado', async () => {
    const r = await classifier.classify({ ...base, message: 'ejecuta la nómina de Juan Pérez' });
    expect(r.intent).toBe('ejecutar_nomina');
    expect(r.extractedParams.empleado).toContain('Juan');
  });

  it('detecta anomalías de asistencia', async () => {
    const r = await classifier.classify({ ...base, message: 'detecta anomalías de asistencia' });
    expect(r.intent).toBe('anomalias_asistencia');
  });

  it('detecta geo-anomalías de marcajes', async () => {
    const r = await classifier.classify({ ...base, message: 'revisa las geo-anomalías de los marcajes' });
    expect(r.intent).toBe('anomalias_asistencia');
  });

  it('detecta predicción de fallo con activo', async () => {
    const r = await classifier.classify({ ...base, message: 'predice el riesgo de fallo del activo prensa S1' });
    expect(r.intent).toBe('predecir_fallo_activo');
    expect(r.extractedParams.activo).toBeTruthy();
  });

  it('dashboard de mantenimiento NO es predicción', async () => {
    const r = await classifier.classify({ ...base, message: 'dame el dashboard de mantenimiento' });
    expect(r.intent).toBe('dashboard_mantenimiento');
  });

  it('detecta proyección de capacidad', async () => {
    const r = await classifier.classify({ ...base, message: 'hay cuellos de botella en producción' });
    expect(r.intent).toBe('proyeccion_capacidad');
  });

  it('detecta simulación de escenario con unidades', async () => {
    const r = await classifier.classify({ ...base, message: 'simula añadir 500 unidades a la línea A' });
    expect(r.intent).toBe('simular_escenario_produccion');
    expect(r.extractedParams.unidades).toBe(500);
    expect(r.extractedParams.linea).toBe('A');
    expect(r.needsMoreInfo).toBe(false);
  });

  it('pide unidades si faltan en la simulación', async () => {
    const r = await classifier.classify({ ...base, message: 'simula un escenario de producción' });
    expect(r.intent).toBe('simular_escenario_produccion');
    expect(r.needsMoreInfo).toBe(true);
    expect(r.missingParams).toContain('unidades');
  });

  it('detecta readiness de producción', async () => {
    const r = await classifier.classify({ ...base, message: 'qué órdenes no están listas para producir' });
    expect(r.intent).toBe('readiness_produccion');
  });

  it('detecta plan de compras', async () => {
    const r = await classifier.classify({ ...base, message: 'sugiere el plan de compras de insumos' });
    expect(r.intent).toBe('plan_compras');
  });

  it('detecta optimización de secuenciación', async () => {
    const r = await classifier.classify({ ...base, message: 'optimiza la secuenciación de producción' });
    expect(r.intent).toBe('optimizar_secuenciacion');
  });

  it('detecta maximizar rentabilidad del scheduling', async () => {
    const r = await classifier.classify({ ...base, message: 'maximiza la rentabilidad del plan de producción' });
    expect(r.intent).toBe('maximizar_rentabilidad_scheduling');
  });

  it('detecta rentabilidad de producción', async () => {
    const r = await classifier.classify({ ...base, message: 'por qué baja la rentabilidad de producción' });
    expect(r.intent).toBe('rentabilidad_produccion');
  });

  it('"ejecuta la nómina" NO cae en crear_lead/registrar', async () => {
    const r = await classifier.classify({ ...base, message: 'ejecuta la nómina de María García' });
    expect(r.intent).toBe('ejecutar_nomina');
  });

  it('"lista los leads" NO cae en plan_compras', async () => {
    const r = await classifier.classify({ ...base, message: 'lista los leads en estado caliente' });
    expect(r.intent).toBe('listar_leads');
  });
});

// ─── 3. Registry de skills ─────────────────────────────────────────────────

describe('skills registry — bloque fábrica avanzada', () => {
  it('los 10 skills están registrados', () => {
    for (const name of [
      'orchestrate_secure_payroll', 'detect_attendance_anomalies', 'predict_asset_failure',
      'get_maintenance_dashboard', 'analyze_capacity_forecast', 'simulate_production_scenario',
      'analyze_production_readiness', 'suggest_procurement_plan', 'analyze_schedule_optimization',
      'maximize_schedule_profitability', 'analyze_production_profitability',
    ] as (keyof typeof skills)[]) {
      expect(typeof skills[name]).toBe('function');
    }
  });
});

// ─── 4. Mapping orchestrator: intent → skill ───────────────────────────────

describe('SkillOrchestrator — wiring del bloque fábrica avanzada', () => {
  const ctx = {
    tenantId: TENANT,
    userId: 'user-1',
    pendingIntent: '',
    collectedEntities: {},
    missingEntities: [],
  };

  it('los 11 intents mapean a sus skills', async () => {
    const cases: Array<[string, Record<string, string>, string]> = [
      ['ejecutar_nomina', { empleado: 'Juan Pérez' }, 'orchestrate_secure_payroll'],
      ['anomalias_asistencia', {}, 'detect_attendance_anomalies'],
      ['predecir_fallo_activo', { activo: 'Prensa S1' }, 'predict_asset_failure'],
      ['dashboard_mantenimiento', {}, 'get_maintenance_dashboard'],
      ['proyeccion_capacidad', {}, 'analyze_capacity_forecast'],
      ['simular_escenario_produccion', { unidades: '500', linea: 'A' }, 'simulate_production_scenario'],
      ['readiness_produccion', {}, 'analyze_production_readiness'],
      ['plan_compras', {}, 'suggest_procurement_plan'],
      ['optimizar_secuenciacion', {}, 'analyze_schedule_optimization'],
      ['maximizar_rentabilidad_scheduling', {}, 'maximize_schedule_profitability'],
      ['rentabilidad_produccion', {}, 'analyze_production_profitability'],
    ];
    for (const [intent, entities, skill] of cases) {
      const result = await (SkillOrchestratorAgent as any).createPlan(
        { intent, entities, missingEntities: [] },
        ctx,
        TENANT,
      );
      expect(result.plan?.steps[0].action).toBe(skill);
    }
  });

  it('sin módulo produccion → mensaje de acceso', async () => {
    mocks.tenantFindUnique.mockResolvedValue({ id: TENANT, plan: 'basico', tenantFeatures: [] } as any);
    const result = await (SkillOrchestratorAgent as any).createPlan(
      { intent: 'predecir_fallo_activo', entities: { activo: 'Prensa S1' }, missingEntities: [] },
      ctx,
      TENANT,
    );
    expect(result.response).toContain('Producción');
  });
});