// @vitest-environment node

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  tenantFindUnique: vi.fn(),
  subscriptionPlanFindUnique: vi.fn(),
  userFindFirst: vi.fn(),
  invoiceAggregate: vi.fn(),
  expenseAggregate: vi.fn(),
  employeeFindMany: vi.fn(),
  productionLogFindMany: vi.fn(),
  leadAggregate: vi.fn(),
  dealFindMany: vi.fn(),
  pipelineStageFindMany: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    tenant: { findUnique: mocks.tenantFindUnique },
    subscriptionPlan: { findUnique: mocks.subscriptionPlanFindUnique },
    user: { findFirst: mocks.userFindFirst },
    invoice: { aggregate: mocks.invoiceAggregate },
    expense: { aggregate: mocks.expenseAggregate },
    employee: { findMany: mocks.employeeFindMany },
    productionLog: { findMany: mocks.productionLogFindMany },
    lead: { aggregate: mocks.leadAggregate },
    deal: { findMany: mocks.dealFindMany },
    pipelineStage: { findMany: mocks.pipelineStageFindMany },
  },
}));

vi.mock('@/lib/skills/event-bus', () => ({
  eventBus: { emitEvent: vi.fn() },
  EVENTS: {},
}));

vi.mock('@/lib/security/vault', () => ({
  VaultService: { decrypt: vi.fn((s: string) => s.replace(/^enc:/, '')) },
}));

const { financeIntents } = await import('@/lib/agents/intents/finance-intents');
const { SkillOrchestratorAgent } = await import('@/lib/agents/skill-orchestrator');
const { skills } = await import('@/lib/skills');
const { ExecutionEngine } = await import('@/lib/agents/execution-engine');

const TENANT = 'tenant-1';

const TENANT_FIXTURE = {
  id: TENANT,
  plan: 'premium',
  tenantFeatures: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.tenantFindUnique.mockResolvedValue(TENANT_FIXTURE as any);
  mocks.subscriptionPlanFindUnique.mockResolvedValue(null); // → fallback PLAN_MODULES
  mocks.userFindFirst.mockResolvedValue({ id: 'user-1' } as any);
  // Resumen financiero base: 10.000€ de ingresos, 2.000€ de gastos, sin nómina
  mocks.invoiceAggregate.mockResolvedValue({ _sum: { monto: 10000 } } as any);
  mocks.expenseAggregate.mockResolvedValue({ _sum: { amount: 2000 } } as any);
  mocks.employeeFindMany.mockResolvedValue([]);
  mocks.productionLogFindMany.mockResolvedValue([]);
  mocks.leadAggregate.mockResolvedValue({ _sum: { valorEstimado: 6000 } } as any);
  // Pipeline de la proyección: un deal de 6.000 en una etapa al 50 %.
  mocks.dealFindMany.mockResolvedValue([{ valor: 6000, moneda: 'MXN', etapa: 'Propuesta' }] as any);
  mocks.pipelineStageFindMany.mockResolvedValue([{ nombre: 'Propuesta', probabilidad: 50 }] as any);
});

// ─── 1. Intents registrados ─────────────────────────────────────────────────

describe('finance-intents — proyecciones', () => {
  it('registra los 3 intents de proyección', () => {
    const names = financeIntents.map(i => i.name);
    for (const n of ['proyeccion_financiera', 'proyeccion_impuestos', 'analizar_rentabilidad_global']) {
      expect(names).toContain(n);
    }
  });

  it('proyeccion_impuestos exige pais; el resto no exige nada', () => {
    const imp = financeIntents.find(i => i.name === 'proyeccion_impuestos')!;
    const fin = financeIntents.find(i => i.name === 'proyeccion_financiera')!;
    const rent = financeIntents.find(i => i.name === 'analizar_rentabilidad_global')!;
    expect(imp.requiredParams).toContain('pais');
    expect(fin.requiredParams).toEqual([]);
    expect(rent.requiredParams).toEqual([]);
    for (const intent of [imp, fin, rent]) {
      expect(intent.destructive).toBe(false);
    }
  });
});

// ─── 2. Mapping orchestrator: intent → skill ───────────────────────────────

describe('SkillOrchestrator — wiring de proyecciones', () => {
  const ctx = {
    tenantId: TENANT,
    userId: 'user-1',
    pendingIntent: '',
    collectedEntities: {},
    missingEntities: [],
  };

  it('los 3 intents mapean a sus skills', async () => {
    const cases: Array<[string, Record<string, string>, string]> = [
      ['proyeccion_financiera', {}, 'project_financial_forecast'],
      ['proyeccion_impuestos', { pais: 'ES' }, 'tax_prospector'],
      ['analizar_rentabilidad_global', {}, 'analyze_global_profitability'],
    ];
    for (const [intent, entities, skill] of cases) {
      const result = await SkillOrchestratorAgent.createPlan({ intent, entities, missingEntities: [] }, ctx, TENANT);
      expect(result.plan?.steps[0].action).toBe(skill);
    }
  });

  it('proyeccion_impuestos sin pais genera un plan para pedirlo', async () => {
    const result = await SkillOrchestratorAgent.createPlan(
      { intent: 'proyeccion_impuestos', entities: {}, missingEntities: ['pais'] },
      ctx,
      TENANT,
    );
    expect(result.plan?.steps[0].action).toBe('ask_user');
  });
});

// ─── 3. Wrappers de skills (mapeo de params ES → core) ─────────────────────

describe('skills — proyecciones', () => {
  it('tax_prospector mapea pais ES → region ES y estima el 21% de IVA', async () => {
    const result = await (skills as any).tax_prospector({ tenantId: TENANT, pais: 'ES' });
    expect(result.region).toBe('ES');
    expect(Number(result.estimatedLiability)).toBeCloseTo(2100, 2); // 10000 × 0.21
    expect(result.advice).toContain('21%');
  });

  it('tax_prospector mapea pais MX → region MX y estima el 16% de IVA', async () => {
    const result = await (skills as any).tax_prospector({ tenantId: TENANT, pais: 'MX' });
    expect(result.region).toBe('MX');
    expect(Number(result.estimatedLiability)).toBeCloseTo(1600, 2); // 10000 × 0.16
    expect(result.advice).toContain('16%');
  });

  it('tax_prospector mapea pais USA_LLC → region USA_LLC (0% sales tax)', async () => {
    const result = await (skills as any).tax_prospector({ tenantId: TENANT, pais: 'USA_LLC' });
    expect(result.region).toBe('USA_LLC');
    expect(Number(result.estimatedLiability)).toBe(0);
  });

  it('analyze_global_profitability convierte months=3 → period last_quarter', async () => {
    const result = await (skills as any).analyze_global_profitability({ tenantId: TENANT, months: 3 });
    expect(result.data.revenue).toBe(10000);
    expect(result.data.expenses).toBe(2000);
    expect(Number(result.data.margin)).toBeGreaterThan(0);
    expect(result.content).toContain('Rentabilidad');
  });

  it('analyze_global_profitability convierte months=12 → period year_to_date', async () => {
    const result = await (skills as any).analyze_global_profitability({ tenantId: TENANT, months: 12 });
    expect(result.data.revenue).toBe(10000);
  });

  it('un periodo sin movimientos no se declara CRÍTICO', async () => {
    mocks.invoiceAggregate.mockResolvedValue({ _sum: { monto: 0 } } as any);
    mocks.expenseAggregate.mockResolvedValue({ _sum: { amount: 0 } } as any);
    const result = await (skills as any).analyze_global_profitability({ tenantId: TENANT, months: 1 });
    expect(result.content).toContain('SIN DATOS');
    expect(result.content).not.toContain('CRÍTICO');
  });

  it('project_financial_forecast pesa el pipeline activo por la probabilidad de su etapa', async () => {
    const result = await (skills as any).project_financial_forecast({ tenantId: TENANT });
    // 6.000 al 50 % → 3.000 ponderados; gasto medio 2.000 / 3 = 666,67 al mes
    // → 3.000 / (666,67 / 30) = 135 días.
    expect(result.data.expectedIn).toBeCloseTo(3000, 2);
    expect(result.data.committedOut).toBeCloseTo(666.67, 2);
    expect(Number(result.data.runwayDays)).toBeCloseTo(135, 0);
    expect(result.content).toContain('Proyección');
  });

  it('sin pipeline ni gasto no inventa un runway', async () => {
    mocks.dealFindMany.mockResolvedValue([] as any);
    mocks.expenseAggregate.mockResolvedValue({ _sum: { amount: 0 } } as any);
    const result = await (skills as any).project_financial_forecast({ tenantId: TENANT });
    // Antes devolvía 5.000 y 1.200 euros de relleno y un runway de 365 días.
    expect(result.data.expectedIn).toBe(0);
    expect(result.data.committedOut).toBe(0);
    expect(result.data.runwayDays).toBeNull();
    expect(result.content).toContain('no calculable');
  });
});

// ─── 4. Formatters de ExecutionEngine ───────────────────────────────────────

describe('ExecutionEngine.formatSkillResult — proyecciones', () => {
  it('project_financial_forecast formatea ingresos, gastos y runway', () => {
    const msg = ExecutionEngine.formatSkillResult('project_financial_forecast', {
      expectedIn: 6000,
      committedOut: 1500,
      runwayDays: 120,
    });
    const plain = msg.replace(/\\/g, '');
    expect(plain).toContain('Proyección a 30 días');
    expect(plain).toContain('6000');
    expect(plain).toContain('120');
  });

  it('tax_prospector formatea la provisión con el país', () => {
    const msg = ExecutionEngine.formatSkillResult('tax_prospector', {
      region: 'ES',
      estimatedLiability: '2100.00',
      advice: 'Reserva el 21% de IVA.',
    });
    const plain = msg.replace(/\\/g, '');
    expect(plain).toContain('España');
    expect(plain).toContain('2100');
    expect(plain).toContain('21%');
  });

  it('analyze_global_profitability formatea ingresos, gastos, margen y estado', () => {
    const msg = ExecutionEngine.formatSkillResult('analyze_global_profitability', {
      revenue: 10000,
      expenses: 2000,
      margin: '80.00',
      status: 'SALUDABLE',
    });
    const plain = msg.replace(/\\/g, '');
    expect(plain).toContain('Rentabilidad global');
    expect(plain).toContain('10.000');
    expect(plain).toContain('80.00');
    expect(plain).toContain('SALUDABLE');
  });

  it('analyze_global_profitability marca el estado crítico con margen bajo', () => {
    const msg = ExecutionEngine.formatSkillResult('analyze_global_profitability', {
      revenue: 100,
      expenses: 200,
      margin: '-100.00',
      status: 'CRÍTICO',
    });
    expect(msg).toContain('CRÍTICO');
  });
});
