// @vitest-environment node

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  tenantFindUnique: vi.fn(),
  subscriptionPlanFindUnique: vi.fn(),
  userFindFirst: vi.fn(),
  leadFindMany: vi.fn(),
  leadFindFirst: vi.fn(),
  leadFindUnique: vi.fn(),
  leadUpdate: vi.fn(),
  callGemma: vi.fn(),
  verifyFinancialIntegrity: vi.fn(),
  auditTenant: vi.fn(),
  expenseFindMany: vi.fn(),
  verifyLedgerIntegrity: vi.fn(),
  systemAlertCreate: vi.fn(),
  productionLogFindMany: vi.fn(),
  stockMovementFindMany: vi.fn(),
  attendanceFindMany: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    tenant: { findUnique: mocks.tenantFindUnique },
    subscriptionPlan: { findUnique: mocks.subscriptionPlanFindUnique },
    user: { findFirst: mocks.userFindFirst },
    lead: { findMany: mocks.leadFindMany, findFirst: mocks.leadFindFirst, findUnique: mocks.leadFindUnique, update: mocks.leadUpdate },
    expense: { findMany: mocks.expenseFindMany },
    systemAlert: { create: mocks.systemAlertCreate },
    productionLog: { findMany: mocks.productionLogFindMany },
    stockMovement: { findMany: mocks.stockMovementFindMany },
    attendance: { findMany: mocks.attendanceFindMany },
  },
}));

vi.mock('@/lib/skills/event-bus', () => ({
  eventBus: { emitEvent: vi.fn() },
  EVENTS: {},
}));

vi.mock('@/lib/ai/gemma-client', () => ({
  callGemma: mocks.callGemma,
}));

vi.mock('@/lib/security/integrity-service', () => ({
  verifyFinancialIntegrity: mocks.verifyFinancialIntegrity,
}));

vi.mock('@/lib/fiscal/audit-service', () => ({
  FiscalAuditService: { auditTenant: mocks.auditTenant },
}));

vi.mock('@/lib/accounting/entry-manager', () => ({
  EntryManager: { verifyLedgerIntegrity: mocks.verifyLedgerIntegrity },
}));

vi.mock('@/lib/telegram', () => ({
  sendTelegramMessage: vi.fn(),
  loadTelegramCredentials: vi.fn(),
}));

const { crmIntents } = await import('@/lib/agents/intents/crm-intents');
const { financeIntents } = await import('@/lib/agents/intents/finance-intents');
const { operationsIntents } = await import('@/lib/agents/intents/operations-intents');
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
  mocks.leadFindMany.mockResolvedValue([
    { id: 'lead-1', nombre: 'Juan Pérez', fechaUltimaActividad: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000) },
  ] as any);
  mocks.leadFindFirst.mockResolvedValue({ id: 'lead-1' } as any);
  mocks.leadFindUnique.mockResolvedValue({ id: 'lead-1', nombre: 'Ana Torres', notasTimestamp: [], deals: [] } as any);
  mocks.leadUpdate.mockResolvedValue({ id: 'lead-1' } as any);
  mocks.callGemma.mockResolvedValue({
    error: null,
    content: JSON.stringify({
      steps: [
        { title: 'Llamada', description: 'Llamada de descubrimiento', icon: 'phone' },
        { title: 'Demo', description: 'Demo personalizada', icon: 'target' },
      ],
      reasoning: 'El lead está en etapa de propuesta.',
    }),
  } as any);
  mocks.verifyFinancialIntegrity.mockResolvedValue(true);
  mocks.auditTenant.mockResolvedValue({ status: 'INTEGRA', breaches: [] } as any);
  mocks.expenseFindMany.mockResolvedValue([]);
  mocks.verifyLedgerIntegrity.mockResolvedValue({ isValid: true, breaches: [] } as any);
  mocks.productionLogFindMany.mockResolvedValue([]);
  mocks.stockMovementFindMany.mockResolvedValue([]);
  mocks.attendanceFindMany.mockResolvedValue([
    {
      id: 'att-1',
      employee: { fullName: 'Carlos Ruiz', role: 'Técnico' },
      locationLat: 19.4326,
      locationLng: -99.1332,
      type: 'CLOCK_IN',
      timestamp: new Date(),
      isAnomaly: false,
    },
  ] as any);
});

// ─── 1. Intents registrados ─────────────────────────────────────────────────

describe('intents — proactividad/auditoría/campo', () => {
  it('registra los 6 intents del Décimo Séptimo', () => {
    const names = [
      ...crmIntents.map(i => i.name),
      ...financeIntents.map(i => i.name),
      ...operationsIntents.map(i => i.name),
    ];
    for (const n of [
      'detectar_ghosting', 'generar_ruta_exito', 'auditar_integridad_gastos',
      'auditar_integridad', 'auditar_fugas_materiales', 'actividad_campo',
    ]) {
      expect(names).toContain(n);
    }
  });

  it('generar_ruta_exito exige email; el resto no exige params', () => {
    const ruta = crmIntents.find(i => i.name === 'generar_ruta_exito')!;
    const ghost = crmIntents.find(i => i.name === 'detectar_ghosting')!;
    const audit = operationsIntents.find(i => i.name === 'auditar_integridad')!;
    expect(ruta.requiredParams).toContain('email');
    expect(ghost.requiredParams).toEqual([]);
    expect(audit.requiredParams).toEqual([]);
    for (const intent of [ruta, ghost, audit]) {
      expect(intent.destructive).toBe(false);
    }
  });
});

// ─── 2. Mapping orchestrator: intent → skill ───────────────────────────────

describe('SkillOrchestrator — wiring', () => {
  const ctx = {
    tenantId: TENANT,
    userId: 'user-1',
    pendingIntent: '',
    collectedEntities: {},
    missingEntities: [],
  };

  it('los 6 intents mapean a sus skills', async () => {
    const cases: Array<[string, Record<string, string>, string]> = [
      ['detectar_ghosting', {}, 'detect_ghosting'],
      ['generar_ruta_exito', { email: 'ana@email.com' }, 'generate_success_path'],
      ['auditar_integridad_gastos', {}, 'audit_expense_integrity'],
      ['auditar_integridad', {}, 'audit_finance_integrity'],
      ['auditar_fugas_materiales', {}, 'audit_material_leaks'],
      ['actividad_campo', {}, 'get_field_activity'],
    ];
    for (const [intent, entities, skill] of cases) {
      const result = await SkillOrchestratorAgent.createPlan({ intent, entities, missingEntities: [] }, ctx, TENANT);
      expect(result.plan?.steps[0].action).toBe(skill);
    }
  });

  it('auditoría financiera NO está en el plan basico (no-access)', async () => {
    mocks.tenantFindUnique.mockResolvedValue({ id: TENANT, plan: 'basico', tenantFeatures: [] } as any);
    const result = await SkillOrchestratorAgent.createPlan(
      { intent: 'auditar_integridad', entities: {}, missingEntities: [] },
      ctx,
      TENANT,
    );
    expect(result.response).toContain('Finanzas');
    expect(result.plan).toBeUndefined();
  });

  it('detectar_ghosting SÍ está en el plan basico (módulo leads)', async () => {
    mocks.tenantFindUnique.mockResolvedValue({ id: TENANT, plan: 'basico', tenantFeatures: [] } as any);
    const result = await SkillOrchestratorAgent.createPlan(
      { intent: 'detectar_ghosting', entities: {}, missingEntities: [] },
      ctx,
      TENANT,
    );
    expect(result.plan?.steps[0].action).toBe('detect_ghosting');
  });
});

// ─── 3. Wrappers de skills ──────────────────────────────────────────────────

describe('skills — proactividad/auditoría/campo', () => {
  it('detect_ghosting convierte días de inactividad a horas', async () => {
    const result = await (skills as any).detect_ghosting({ tenantId: TENANT, dias_inactivo: 7 });
    expect(Array.isArray(result)).toBe(true);
    expect(result[0].nombre).toBe('Juan Pérez');
    expect(result[0].horasInactivo).toBeGreaterThan(0);
  });

  it('generate_success_path resuelve el lead por email y genera la ruta', async () => {
    const result = await (skills as any).generate_success_path({ tenantId: TENANT, email: 'ana@email.com' });
    expect(mocks.leadFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ tenantId: TENANT, email: 'ana@email.com' }) }),
    );
    expect(result.steps.length).toBe(2);
    expect(mocks.callGemma).toHaveBeenCalled();
  });

  it('generate_success_path resuelve el lead por nombre y limpia conectores', async () => {
    const result = await (skills as any).generate_success_path({ tenantId: TENANT, nombre: 'de Ana Torres' });
    expect(mocks.leadFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ tenantId: TENANT, nombre: expect.objectContaining({ contains: 'Ana Torres' }) }) }),
    );
    expect(result.steps.length).toBeGreaterThan(0);
  });

  it('generate_success_path sin lead lanza error claro', async () => {
    mocks.leadFindFirst.mockResolvedValue(null);
    await expect((skills as any).generate_success_path({ tenantId: TENANT, email: 'x@y.com' })).rejects.toThrow('lead');
  });

  it('audit_expense_integrity con cadena íntegra devuelve OK', async () => {
    const result = await (skills as any).audit_expense_integrity({ tenantId: TENANT });
    expect(result.status).toBe('OK');
  });

  it('audit_finance_integrity sin brechas devuelve ÍNTEGRA', async () => {
    const result = await (skills as any).audit_finance_integrity({ tenantId: TENANT });
    expect(result.status).toBe('ÍNTEGRA');
    expect(mocks.systemAlertCreate).not.toHaveBeenCalled();
  });

  it('audit_material_leaks estable sin ajustes sospechosos', async () => {
    const result = await (skills as any).audit_material_leaks({ tenantId: TENANT });
    expect(result.status).toBe('STABLE');
    expect(result.leakSummary.anomaliesCount).toBe(0);
  });

  it('get_field_activity lista los técnicos con check-in de hoy', async () => {
    const result = await (skills as any).get_field_activity({ tenantId: TENANT });
    expect(result.activeTechs.length).toBe(1);
    expect(result.activeTechs[0].technician).toBe('Carlos Ruiz');
    expect(result.activeTechs[0].status).toBe('CLOCK_IN');
  });
});

// ─── 4. Formatters de ExecutionEngine ───────────────────────────────────────

describe('ExecutionEngine.formatSkillResult — proactividad/auditoría/campo', () => {
  it('detect_ghosting formatea la lista de leads fantasma', () => {
    const msg = ExecutionEngine.formatSkillResult('detect_ghosting', [
      { nombre: 'Juan Pérez', horasInactivo: 240, ultimaActividad: new Date() },
    ]);
    expect(msg).toContain('Leads fantasma');
    expect(msg).toContain('Juan Pérez');
    expect(msg).toContain('240');
  });

  it('detect_ghosting sin leads devuelve mensaje de tranquilidad', () => {
    const msg = ExecutionEngine.formatSkillResult('detect_ghosting', []);
    expect(msg).toContain('No hay leads fantasma');
  });

  it('generate_success_path formatea los pasos', () => {
    const msg = ExecutionEngine.formatSkillResult('generate_success_path', {
      steps: [{ title: 'Llamada', description: 'Llamada de descubrimiento' }],
      metadata: { reasoning: 'Está en propuesta.' },
    });
    expect(msg).toContain('Ruta de éxito');
    expect(msg).toContain('Llamada');
    expect(msg).toContain('Está en propuesta');
  });

  it('audit_expense_integrity formatea OK y ALERT', () => {
    const ok = ExecutionEngine.formatSkillResult('audit_expense_integrity', { status: 'OK', content: 'La bóveda financiera está íntegra.' });
    expect(ok).toContain('íntegra');
    const alert = ExecutionEngine.formatSkillResult('audit_expense_integrity', { status: 'ALERT', content: 'Integridad comprometida.' });
    expect(alert).toContain('Integridad comprometida');
  });

  it('audit_finance_integrity formatea el protocolo de desconfianza', () => {
    const msg = ExecutionEngine.formatSkillResult('audit_finance_integrity', {
      status: 'COMPROMETIDA',
      invoiceAudit: { breaches: [{}] },
      expenseBreaches: ['x'],
      ledgerAudit: { breaches: [] },
    });
    expect(msg).toContain('PROTOCOLO DE DESCONFIANZA');
    expect(msg).toContain('Facturas: 1');
    expect(msg).toContain('Gastos: 1');
  });

  it('audit_material_leaks formatea el estado', () => {
    const msg = ExecutionEngine.formatSkillResult('audit_material_leaks', {
      status: 'CRITICAL',
      leakSummary: { anomaliesCount: 7, automaticConsumptionCount: 12 },
      recommendation: 'Iniciar auditoría física',
    });
    expect(msg).toContain('CRÍTICO');
    expect(msg).toContain('7');
  });

  it('get_field_activity formatea los técnicos', () => {
    const msg = ExecutionEngine.formatSkillResult('get_field_activity', {
      activeTechs: [{ technician: 'Carlos Ruiz', role: 'Técnico', lat: 19.43, lng: -99.13, status: 'CLOCK_IN', isAnomaly: false }],
    });
    expect(msg).toContain('Actividad de campo');
    expect(msg).toContain('Carlos Ruiz');
    expect(msg).toContain('activo');
  });
});
