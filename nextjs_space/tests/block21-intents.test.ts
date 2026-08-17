// @vitest-environment node

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  userFindFirst: vi.fn(),
  tenantFindUnique: vi.fn(),
  subscriptionPlanFindUnique: vi.fn(),
  employeeFindFirst: vi.fn(),
  vacationRequestsFindMany: vi.fn(),
  employeeAssetsFindMany: vi.fn(),
  digitalAccessFindMany: vi.fn(),
  workOrderFindMany: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findFirst: mocks.userFindFirst },
    tenant: { findUnique: mocks.tenantFindUnique },
    subscriptionPlan: { findUnique: mocks.subscriptionPlanFindUnique },
    employee: { findFirst: mocks.employeeFindFirst },
    erp_vacation_requests: { findMany: mocks.vacationRequestsFindMany },
    erp_employee_assets: { findMany: mocks.employeeAssetsFindMany },
    erp_digital_access: { findMany: mocks.digitalAccessFindMany },
    workOrder: { findMany: mocks.workOrderFindMany },
  },
}));

vi.mock('@/lib/skills/event-bus', () => ({
  eventBus: { emitEvent: vi.fn() },
  EVENTS: {},
}));

const { hrAdvancedIntents } = await import('@/lib/agents/intents/hr-advanced-intents');
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
  mocks.userFindFirst.mockResolvedValue({ id: 'user-1', role: { nombre: 'OWNER' } } as any);
  mocks.employeeFindFirst.mockResolvedValue({ id: 'emp-1', fullName: 'María García' } as any);
  mocks.vacationRequestsFindMany.mockResolvedValue([
    { id: 'vac-1', startDate: new Date('2026-09-01'), endDate: new Date('2026-09-10'), status: 'PENDING', employeeId: 'emp-1', tenantId: TENANT },
    { id: 'vac-0', startDate: new Date('2026-05-01'), endDate: new Date('2026-05-05'), status: 'APPROVED', employeeId: 'emp-1', tenantId: TENANT },
  ] as any);
  mocks.employeeAssetsFindMany.mockResolvedValue([
    { id: 'ast-1', employeeId: 'emp-1', status: 'ASSIGNED', tenantId: TENANT },
  ] as any);
  mocks.digitalAccessFindMany.mockResolvedValue([
    { id: 'acc-1', employeeId: 'emp-1', status: 'ACTIVE', isCritical: true, tenantId: TENANT },
  ] as any);
  mocks.workOrderFindMany.mockResolvedValue([]);
});

describe('IntentClassifier — bloque 21 (RRHH/Producción avanzada)', () => {
  const classifier = makeClassifier();
  const base = { message: '', userId: 'user-1', tenantId: TENANT };

  it('detecta resumen de gastos pendientes de autorizar', async () => {
    const r = await classifier.classify({ ...base, message: 'qué gastos están pendientes de autorizar' });
    expect(r.intent).toBe('resumen_gastos_pendientes');
  });

  it('detecta gastos sin aprobar', async () => {
    const r = await classifier.classify({ ...base, message: 'resumen de gastos de empleados sin aprobar' });
    expect(r.intent).toBe('resumen_gastos_pendientes');
  });

  it('detecta gastos esperando autorización', async () => {
    const r = await classifier.classify({ ...base, message: 'cuántos gastos esperan autorización' });
    expect(r.intent).toBe('resumen_gastos_pendientes');
  });

  it('detecta impacto de vacaciones con empleado', async () => {
    const r = await classifier.classify({ ...base, message: 'cuál es el impacto de las vacaciones de María García' });
    expect(r.intent).toBe('impacto_vacaciones');
    expect(r.extractedParams.nombre).toBeTruthy();
  });

  it('detecta qué pasa si un empleado se va de vacaciones', async () => {
    const r = await classifier.classify({ ...base, message: 'qué pasa si Carlos Ruiz se va de vacaciones la semana que viene' });
    expect(r.intent).toBe('impacto_vacaciones');
  });

  it('detecta cuellos de botella puntuales (no proyección)', async () => {
    const r = await classifier.classify({ ...base, message: 'dónde está el cuello de botella en la planta' });
    expect(r.intent).toBe('detectar_cuellos_botella');
  });

  it('detecta retrasos críticos en líneas', async () => {
    const r = await classifier.classify({ ...base, message: 'qué líneas tienen retrasos críticos' });
    expect(r.intent).toBe('detectar_cuellos_botella');
  });

  it('detecta estrangulamientos en producción', async () => {
    const r = await classifier.classify({ ...base, message: 'hay estrangulamientos en producción' });
    expect(r.intent).toBe('detectar_cuellos_botella');
  });

  it('detecta estrategia de ensamblaje', async () => {
    const r = await classifier.classify({ ...base, message: 'cuál es la mejor estrategia de ensamblaje' });
    expect(r.intent).toBe('estrategia_ensamblaje');
  });

  it('detecta optimización de línea de montaje', async () => {
    const r = await classifier.classify({ ...base, message: 'cómo optimizar la línea de montaje' });
    expect(r.intent).toBe('estrategia_ensamblaje');
  });

  it('detecta firma digital de vacaciones', async () => {
    const r = await classifier.classify({ ...base, message: 'firma digitalmente las vacaciones de María García' });
    expect(r.intent).toBe('firma_digital_hr');
    expect(r.extractedParams.nombre).toBeTruthy();
  });

  it('detecta sello digital de aprobación (no cae en aprobar_vacaciones)', async () => {
    const r = await classifier.classify({ ...base, message: 'genera la aprobación sellada de vacaciones de Laura Díaz' });
    expect(r.intent).toBe('firma_digital_hr');
  });

  it('NO colisiona: "hay cuellos de botella en producción" sigue siendo proyección', async () => {
    const r = await classifier.classify({ ...base, message: 'hay cuellos de botella en producción' });
    expect(r.intent).toBe('proyeccion_capacidad');
  });

  it('NO colisiona: "aprueba las vacaciones de María" sigue siendo aprobar_vacaciones', async () => {
    const r = await classifier.classify({ ...base, message: 'aprueba la solicitud de vacaciones de María García' });
    expect(r.intent).toBe('aprobar_vacaciones');
  });

  it('NO colisiona: "analiza los gastos del mes" sigue siendo analizar_gastos', async () => {
    const r = await classifier.classify({ ...base, message: 'analiza los gastos del mes' });
    expect(r.intent).toBe('analizar_gastos');
  });

  it('los 5 intents están declarados en el schema', () => {
    const names = hrAdvancedIntents.map((i) => i.name);
    expect(names).toEqual(
      expect.arrayContaining(['resumen_gastos_pendientes', 'impacto_vacaciones', 'detectar_cuellos_botella', 'estrategia_ensamblaje', 'firma_digital_hr']),
    );
  });
});

describe('skills registry — bloque 21', () => {
  it('los 5 skills están registrados', () => {
    for (const name of [
      'summarize_pending_expenses',
      'analyze_vacation_impact',
      'detect_bottlenecks',
      'suggest_assembly_strategy',
      'orchestrate_digital_signature',
    ] as (keyof typeof skills)[]) {
      expect(typeof skills[name]).toBe('function');
    }
  });
});

describe('SkillOrchestrator — wiring del bloque 21', () => {
  const ctx = {
    tenantId: TENANT,
    userId: 'user-1',
    pendingIntent: '',
    collectedEntities: {},
    missingEntities: [],
  };

  it('los 5 intents mapean a sus skills', async () => {
    const cases: Array<[string, Record<string, string>, string]> = [
      ['resumen_gastos_pendientes', {}, 'summarize_pending_expenses'],
      ['impacto_vacaciones', { nombre: 'María García' }, 'analyze_vacation_impact'],
      ['detectar_cuellos_botella', {}, 'detect_bottlenecks'],
      ['estrategia_ensamblaje', {}, 'suggest_assembly_strategy'],
      ['firma_digital_hr', { nombre: 'María García' }, 'orchestrate_digital_signature'],
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

  it('bloque 21 respeta el módulo produccion (plan básico → sin acceso)', async () => {
    mocks.tenantFindUnique.mockResolvedValue({ id: TENANT, plan: 'basico', tenantFeatures: [] } as any);
    const result = await (SkillOrchestratorAgent as any).createPlan(
      { intent: 'detectar_cuellos_botella', entities: {}, missingEntities: [] },
      ctx,
      TENANT,
    );
    expect(result.response).toContain('Producción');
  });

  it('bloque 21 respeta el módulo rrhh (plan básico → sin acceso)', async () => {
    mocks.tenantFindUnique.mockResolvedValue({ id: TENANT, plan: 'basico', tenantFeatures: [] } as any);
    const result = await (SkillOrchestratorAgent as any).createPlan(
      { intent: 'impacto_vacaciones', entities: {}, missingEntities: [] },
      ctx,
      TENANT,
    );
    expect(result.response).toContain('RRHH');
  });
});

describe('analyze_vacation_impact — wrapper con datos reales', () => {
  it('resuelve el empleado por nombre y devuelve texto + recomendación', async () => {
    const result = await skills.analyze_vacation_impact({
      tenantId: TENANT,
      nombre: 'María García',
    });
    expect(result).toBeTruthy();
    // 2 solicitudes: 1 aprobada (5 días) → restan 25 de 30; 1 pendiente de 10 días
    expect((result as any).data_snapshot.remainingDays).toBe(25);
    expect((result as any).data_snapshot.requestedDays).toBe(10);
    expect((result as any).message).toContain('María García');
  });

  it('pide el empleado si no se indica', async () => {
    await expect(
      skills.analyze_vacation_impact({ tenantId: TENANT, nombre: undefined }),
    ).rejects.toThrow(/Necesito saber de qué empleado/);
  });
});