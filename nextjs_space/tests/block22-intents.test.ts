// @vitest-environment node

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  userFindFirst: vi.fn(),
  tenantFindUnique: vi.fn(),
  subscriptionPlanFindUnique: vi.fn(),
  employeeFindFirst: vi.fn(),
  employeeFindUnique: vi.fn(),
  expenseClaimsFindMany: vi.fn(),
  expenseClaimsFindUnique: vi.fn(),
  expenseClaimsUpdate: vi.fn(),
  employeeAssetsFindMany: vi.fn(),
  employeeAssetsFindFirst: vi.fn(),
  employeeAssetsFindUnique: vi.fn(),
  digitalAccessFindMany: vi.fn(),
  systemAlertCreate: vi.fn(),
  expenseCreate: vi.fn(),
  financialAuditCreate: vi.fn(),
  adScheduleFindFirst: vi.fn(),
  adScheduleUpdate: vi.fn(),
  adCampaignFindFirst: vi.fn(),
  chatbotAuditLogCreate: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findFirst: mocks.userFindFirst },
    tenant: { findUnique: mocks.tenantFindUnique },
    subscriptionPlan: { findUnique: mocks.subscriptionPlanFindUnique },
    employee: { findFirst: mocks.employeeFindFirst, findUnique: mocks.employeeFindUnique },
    erp_expense_claims: {
      findMany: mocks.expenseClaimsFindMany,
      findUnique: mocks.expenseClaimsFindUnique,
      update: mocks.expenseClaimsUpdate,
    },
    erp_employee_assets: {
      findMany: mocks.employeeAssetsFindMany,
      findFirst: mocks.employeeAssetsFindFirst,
      findUnique: mocks.employeeAssetsFindUnique,
    },
    erp_digital_access: { findMany: mocks.digitalAccessFindMany },
    systemAlert: { create: mocks.systemAlertCreate },
    expense: { create: mocks.expenseCreate },
    financialAudit: { create: mocks.financialAuditCreate },
    adSchedule: { findFirst: mocks.adScheduleFindFirst, update: mocks.adScheduleUpdate },
    adCampaign: { findFirst: mocks.adCampaignFindFirst },
    chatbotAuditLog: { create: mocks.chatbotAuditLogCreate },
  },
}));

vi.mock('@/lib/skills/event-bus', () => ({
  eventBus: { emitEvent: vi.fn() },
  EVENTS: {},
}));

vi.mock('@/lib/security/integrity-service', () => ({
  generateIntegrityHash: vi.fn().mockResolvedValue('hash-abc123'),
  verifyFinancialIntegrity: vi.fn().mockResolvedValue(true),
  reportSecurityIncident: vi.fn(),
}));

const { hrGovernanceIntents } = await import('@/lib/agents/intents/hr-governance-intents');
const { marketingIntents } = await import('@/lib/agents/intents/marketing-intents');
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
  mocks.employeeFindUnique.mockResolvedValue({
    id: 'emp-1',
    fullName: 'María García',
    erp_digital_access: [{ id: 'acc-1', resourceName: 'CRM', environment: 'PROD', identifier: 'm', accessLevel: 'ADMIN', isCritical: true, status: 'ACTIVE' }],
  } as any);
  mocks.expenseClaimsFindMany.mockResolvedValue([
    { id: 'claim-1', employeeId: 'emp-1', amount: 45.9, currency: 'EUR', category: 'Comida', description: 'Cliente', status: 'PENDING', visionLockData: { exif_verified: true } },
  ] as any);
  mocks.expenseClaimsFindUnique.mockResolvedValue({
    id: 'claim-1', employeeId: 'emp-1', amount: 45.9, currency: 'EUR', category: 'Comida', status: 'PENDING',
    erp_employees: { fullName: 'María García' },
  } as any);
  mocks.expenseClaimsUpdate.mockResolvedValue({ id: 'claim-1', status: 'APPROVED' } as any);
  mocks.employeeAssetsFindMany.mockResolvedValue([{ id: 'ast-1', employeeId: 'emp-1', status: 'ASSIGNED' }] as any);
  mocks.employeeAssetsFindFirst.mockResolvedValue({ id: 'ast-1' } as any);
  mocks.employeeAssetsFindUnique.mockResolvedValue({
    id: 'ast-1',
    tenantId: TENANT,
    employeeId: 'emp-1',
    catalogoItemId: 'cat-1',
    serialNumber: 'SN-001',
    status: 'ASSIGNED',
    catalogoItem: { nombre: 'Portátil HP' },
    erp_employees: { fullName: 'María García' },
  } as any);
  mocks.digitalAccessFindMany.mockResolvedValue([
    { id: 'acc-1', employeeId: 'emp-1', environment: 'PROD', accessLevel: 'ADMIN', resourceName: 'CRM', identifier: 'm', isCritical: true, status: 'ACTIVE', erp_employees: { fullName: 'María García' } },
  ] as any);
  mocks.systemAlertCreate.mockResolvedValue({ id: 'alert-1' } as any);
  mocks.expenseCreate.mockResolvedValue({ id: 'exp-1' } as any);
  mocks.financialAuditCreate.mockResolvedValue({ id: 'audit-1' } as any);
  mocks.adScheduleFindFirst.mockResolvedValue({ id: 'sched-1' } as any);
  mocks.adScheduleUpdate.mockResolvedValue({ id: 'sched-1', name: 'Activación — verano', enabled: false } as any);
  mocks.adCampaignFindFirst.mockResolvedValue({ id: 'camp-1' } as any);
  mocks.chatbotAuditLogCreate.mockResolvedValue({ id: 'log-1' } as any);
});

describe('IntentClassifier — bloque 22 (gobernanza RRHH + Ads)', () => {
  const classifier = makeClassifier();
  const base = { message: '', userId: 'user-1', tenantId: TENANT };

  it('detecta autorización masiva de gastos', async () => {
    const r = await classifier.classify({ ...base, message: 'autoriza todos los gastos pendientes' });
    expect(r.intent).toBe('autorizar_gastos');
  });

  it('detecta aprobar las solicitudes de gasto', async () => {
    const r = await classifier.classify({ ...base, message: 'aprueba las solicitudes de gasto de los empleados' });
    expect(r.intent).toBe('autorizar_gastos');
  });

  it('detecta transferencia de activo con destino', async () => {
    const r = await classifier.classify({ ...base, message: 'transfiere el portátil de María a Juan' });
    expect(r.intent).toBe('transferir_activo');
    expect(r.extractedParams.destino).toBeTruthy();
  });

  it('detecta devolución de activo', async () => {
    const r = await classifier.classify({ ...base, message: 'devuelve el activo del técnico' });
    expect(r.intent).toBe('transferir_activo');
  });

  it('detecta traspaso de tablet entre empleados', async () => {
    const r = await classifier.classify({ ...base, message: 'traspasa la tablet de Pedro a Lucía' });
    expect(r.intent).toBe('transferir_activo');
  });

  it('detecta auditoría de accesos críticos', async () => {
    const r = await classifier.classify({ ...base, message: 'audita los accesos críticos del sistema' });
    expect(r.intent).toBe('auditar_accesos');
  });

  it('detecta silos de conocimiento', async () => {
    const r = await classifier.classify({ ...base, message: 'detecta silos de conocimiento' });
    expect(r.intent).toBe('auditar_accesos');
  });

  it('detecta kit de offboarding de un empleado', async () => {
    const r = await classifier.classify({ ...base, message: 'genera el kit de seguridad de baja de María García' });
    expect(r.intent).toBe('kit_offboarding');
    expect(r.extractedParams.nombre).toBeTruthy();
  });

  it('detecta kill-switch por nombre', async () => {
    const r = await classifier.classify({ ...base, message: 'kill-switch para Juan Pérez' });
    expect(r.intent).toBe('kit_offboarding');
  });

  it('detecta pausa de programación existente (no crear)', async () => {
    const r = await classifier.classify({ ...base, message: 'pausa la programación de la campaña de verano' });
    expect(r.intent).toBe('pausar_programacion');
    expect(r.extractedParams.programacion).toBeTruthy();
  });

  it('detecta reanudar el horario de una campaña', async () => {
    const r = await classifier.classify({ ...base, message: 'reanuda el horario de la campaña de Meta' });
    expect(r.intent).toBe('pausar_programacion');
  });

  it('NO colisiona: "qué gastos están pendientes de autorizar" es resumen', async () => {
    const r = await classifier.classify({ ...base, message: 'qué gastos están pendientes de autorizar' });
    expect(r.intent).toBe('resumen_gastos_pendientes');
  });

  it('NO colisiona: "aprueba la solicitud de vacaciones" sigue siendo aprobar_vacaciones', async () => {
    const r = await classifier.classify({ ...base, message: 'aprueba la solicitud de vacaciones de María García' });
    expect(r.intent).toBe('aprobar_vacaciones');
  });

  it('NO colisiona: "audita la integridad financiera" no es auditoría de accesos', async () => {
    const r = await classifier.classify({ ...base, message: 'audita la integridad financiera' });
    expect(r.intent).toBe('auditar_integridad');
  });

  it('NO colisiona: "pausa mi campaña los fines de semana" sigue siendo programar_campania', async () => {
    const r = await classifier.classify({ ...base, message: 'pausa mi campaña de Google Ads los fines de semana' });
    expect(r.intent).toBe('programar_campania');
  });

  it('los 4 intents de gobernanza están declarados en el schema', () => {
    const names = hrGovernanceIntents.map((i) => i.name);
    expect(names).toEqual(
      expect.arrayContaining(['autorizar_gastos', 'transferir_activo', 'auditar_accesos', 'kit_offboarding']),
    );
  });

  it('pausar_programacion está declarado en marketing (Ads)', () => {
    const names = marketingIntents.map((i) => i.name);
    expect(names).toContain('pausar_programacion');
  });
});

describe('skills registry — bloque 22', () => {
  it('los 5 skills están registrados', () => {
    for (const name of [
      'authorize_bulk_expenses',
      'orchestrate_asset_transfer',
      'access_security_audit',
      'generate_offboarding_security_kit',
      'toggle_ad_schedule',
    ] as (keyof typeof skills)[]) {
      expect(typeof skills[name]).toBe('function');
    }
  });
});

describe('SkillOrchestrator — wiring del bloque 22', () => {
  const ctx = {
    tenantId: TENANT,
    userId: 'user-1',
    pendingIntent: '',
    collectedEntities: {},
    missingEntities: [],
  };

  it('los 5 intents mapean a sus skills', async () => {
    const cases: Array<[string, Record<string, string>, string]> = [
      ['autorizar_gastos', {}, 'authorize_bulk_expenses'],
      ['transferir_activo', { activo: 'portátil', destino: 'Juan Pérez' }, 'orchestrate_asset_transfer'],
      ['auditar_accesos', {}, 'access_security_audit'],
      ['kit_offboarding', { nombre: 'María García' }, 'generate_offboarding_security_kit'],
      ['pausar_programacion', { programacion: 'verano' }, 'toggle_ad_schedule'],
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

  it('bloque 22 respeta el módulo rrhh (plan básico → sin acceso)', async () => {
    mocks.tenantFindUnique.mockResolvedValue({ id: TENANT, plan: 'basico', tenantFeatures: [] } as any);
    const result = await (SkillOrchestratorAgent as any).createPlan(
      { intent: 'autorizar_gastos', entities: {}, missingEntities: [] },
      ctx,
      TENANT,
    );
    expect(result.response).toContain('RRHH');
  });

  it('pausar_programacion mapea al módulo ads (activo en plan básico → plan directo)', async () => {
    mocks.tenantFindUnique.mockResolvedValue({ id: TENANT, plan: 'basico', tenantFeatures: [] } as any);
    const result = await (SkillOrchestratorAgent as any).createPlan(
      { intent: 'pausar_programacion', entities: { programacion: 'verano' }, missingEntities: [] },
      ctx,
      TENANT,
    );
    // ads está incluido en el plan básico, así que se construye el plan (no "sin acceso")
    expect(result.plan?.steps[0].action).toBe('toggle_ad_schedule');
  });
});

describe('wrappers del bloque 22', () => {
  it('authorize_bulk_expenses autoriza gastos con userId real del tenant', async () => {
    const result = await (skills as any).authorize_bulk_expenses({
      tenantId: TENANT,
      userId: 'chat-123',
    });
    expect(result).toBeTruthy();
    expect(mocks.expenseClaimsFindMany).toHaveBeenCalled();
    expect((result as any).details?.authorizedCount).toBeGreaterThan(0);
    // La respuesta debe incluir el detalle: número de gastos y monto total.
    expect((result as any).text).toContain('He autorizado');
    expect((result as any).details?.totalAuthorized).toBeGreaterThan(0);
  });

  it('orchestrate_asset_transfer resuelve el activo por nombre y transfiere', async () => {
    const result = await (skills as any).orchestrate_asset_transfer({
      tenantId: TENANT,
      activo: 'Portátil HP',
      destino: 'Juan Pérez',
    });
    expect(result).toBeTruthy();
    expect(mocks.employeeAssetsFindFirst).toHaveBeenCalled();
    expect(result.message).toContain('Traspaso');
  });

  it('access_security_audit detecta silos y super-usuarios', async () => {
    const result = await (skills as any).access_security_audit({
      tenantId: TENANT,
    });
    expect(result).toBeTruthy();
    expect(mocks.digitalAccessFindMany).toHaveBeenCalled();
  });

  it('generate_offboarding_security_kit genera roadmap de revocación', async () => {
    const result = await (skills as any).generate_offboarding_security_kit({
      tenantId: TENANT,
      nombre: 'María García',
    });
    expect(result).toBeTruthy();
    expect(mocks.employeeFindFirst).toHaveBeenCalled();
  });

  it('toggle_ad_schedule resuelve la programación por nombre y la pausa', async () => {
    const result = await (skills as any).toggle_ad_schedule({
      tenantId: TENANT,
      programacion: 'verano',
      accion: 'PAUSE',
    });
    expect(result).toBeTruthy();
    expect(mocks.adScheduleFindFirst).toHaveBeenCalled();
    expect(mocks.adScheduleUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { enabled: false } }),
    );
  });
});
