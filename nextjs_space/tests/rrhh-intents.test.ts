// @vitest-environment node

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  tenantFindUnique: vi.fn(),
  subscriptionPlanFindUnique: vi.fn(),
  userFindFirst: vi.fn(),
  employeeFindUnique: vi.fn(),
  employeeFindFirst: vi.fn(),
  employeeFindMany: vi.fn(),
  taskCount: vi.fn(),
  vacationFindUnique: vi.fn(),
  vacationFindFirst: vi.fn(),
  vacationFindMany: vi.fn(),
  vacationUpdate: vi.fn(),
  systemAlertCreate: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    tenant: { findUnique: mocks.tenantFindUnique },
    subscriptionPlan: { findUnique: mocks.subscriptionPlanFindUnique },
    user: { findFirst: mocks.userFindFirst },
    employee: {
      findUnique: mocks.employeeFindUnique,
      findFirst: mocks.employeeFindFirst,
      findMany: mocks.employeeFindMany,
    },
    task: { count: mocks.taskCount },
    erp_vacation_requests: {
      findUnique: mocks.vacationFindUnique,
      findFirst: mocks.vacationFindFirst,
      findMany: mocks.vacationFindMany,
      update: mocks.vacationUpdate,
    },
    systemAlert: { create: mocks.systemAlertCreate },
  },
}));

vi.mock('@/lib/skills/event-bus', () => ({
  eventBus: { emitEvent: vi.fn() },
  EVENTS: {},
}));

const { hrIntents } = await import('@/lib/agents/intents/hr-intents');
const { SkillOrchestratorAgent } = await import('@/lib/agents/skill-orchestrator');
const { skills } = await import('@/lib/skills');
const { ExecutionEngine } = await import('@/lib/agents/execution-engine');

const TENANT = 'tenant-1';

// rrhh SÍ está en el fallback de PLAN_MODULES (ALL_FEATURES_SET), así que el
// plan 'premium' sin overrides lo habilita automáticamente.
const TENANT_FIXTURE = {
  id: TENANT,
  plan: 'premium',
  tenantFeatures: [],
};

const EMPLOYEE_MARIA = { id: 'emp-1', userId: 'user-m', fullName: 'María López' };
const EMPLOYEE_CARLOS = { id: 'emp-2', userId: 'user-c', fullName: 'Carlos Ruiz' };

const PENDING_VACATION = {
  id: 'c1234567890abcdefghijklmnopqrstuvwxyz1',
  employeeId: 'emp-1',
  tenantId: TENANT,
  status: 'PENDING',
  startDate: new Date('2026-08-20T00:00:00.000Z'),
  endDate: new Date('2026-08-27T00:00:00.000Z'),
  approvedById: null,
  createdAt: new Date('2026-08-01T10:00:00.000Z'),
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.tenantFindUnique.mockResolvedValue(TENANT_FIXTURE as any);
  mocks.subscriptionPlanFindUnique.mockResolvedValue(null); // → fallback PLAN_MODULES
  mocks.userFindFirst.mockResolvedValue({ id: 'user-1' } as any);
  mocks.systemAlertCreate.mockResolvedValue({});
});

// ─── 1. Intents registrados ─────────────────────────────────────────────────

describe('hr-intents', () => {
  it('registra los 3 intents de RRHH', () => {
    const names = hrIntents.map(i => i.name);
    expect(names).toContain('resumen_rrhh');
    expect(names).toContain('aprobar_vacaciones');
    expect(names).toContain('riesgo_rotacion');
  });

  it('aprobar_vacaciones se satisface por solicitudId o nombre', () => {
    const intent = hrIntents.find(i => i.name === 'aprobar_vacaciones')!;
    expect(intent.requiredParams).toEqual(['solicitudId']);
    expect(intent.optionalParams).toContain('nombre');
    expect(intent.optionalParams).toContain('nota');
    expect(intent.destructive).toBe(false);
  });

  it('resumen_rrhh sin requeridos y riesgo_rotacion con empleadoId opcional', () => {
    const resumen = hrIntents.find(i => i.name === 'resumen_rrhh')!;
    const riesgo = hrIntents.find(i => i.name === 'riesgo_rotacion')!;
    expect(resumen.requiredParams).toEqual([]);
    expect(riesgo.requiredParams).toEqual([]);
    expect(riesgo.optionalParams).toContain('empleadoId');
    expect(riesgo.destructive).toBe(false);
  });

  it('ningún intent de RRHH es destructive', () => {
    for (const intent of hrIntents) {
      expect(intent.destructive).toBe(false);
    }
  });
});

// ─── 2. Mapping orchestrator: intent → skill ───────────────────────────────

describe('SkillOrchestrator — wiring de RRHH', () => {
  const ctx = {
    tenantId: TENANT,
    userId: 'user-1',
    pendingIntent: '',
    collectedEntities: {},
    missingEntities: [],
  };

  it('resumen_rrhh → get_hr_daily_brief', async () => {
    const result = await SkillOrchestratorAgent.createPlan(
      { intent: 'resumen_rrhh', entities: {}, missingEntities: [] },
      ctx,
      TENANT,
    );
    expect(result.success).toBe(true);
    expect(result.plan?.steps[0].action).toBe('get_hr_daily_brief');
  });

  it('aprobar_vacaciones con nombre → approve_vacation_voice (sin exigir solicitudId)', async () => {
    const result = await SkillOrchestratorAgent.createPlan(
      { intent: 'aprobar_vacaciones', entities: { nombre: 'María López' }, missingEntities: [] },
      ctx,
      TENANT,
    );
    expect(result.success).toBe(true);
    expect(result.plan?.steps[0].action).toBe('approve_vacation_voice');
    expect(result.plan?.steps[0].params).toMatchObject({ tenantId: TENANT, nombre: 'María López' });
  });

  it('aprobar_vacaciones con solicitudId → approve_vacation_voice', async () => {
    const result = await SkillOrchestratorAgent.createPlan(
      { intent: 'aprobar_vacaciones', entities: { solicitudId: '123' }, missingEntities: [] },
      ctx,
      TENANT,
    );
    expect(result.plan?.steps[0].action).toBe('approve_vacation_voice');
  });

  it('riesgo_rotacion → talent_retention_risk', async () => {
    const result = await SkillOrchestratorAgent.createPlan(
      { intent: 'riesgo_rotacion', entities: {}, missingEntities: [] },
      ctx,
      TENANT,
    );
    expect(result.plan?.steps[0].action).toBe('talent_retention_risk');
  });

  it('sin acceso al módulo rrhh devuelve el mensaje de no acceso', async () => {
    mocks.tenantFindUnique.mockResolvedValue({ id: TENANT, plan: 'basico', tenantFeatures: [] } as any);
    const result = await SkillOrchestratorAgent.createPlan(
      { intent: 'aprobar_vacaciones', entities: { solicitudId: '123' }, missingEntities: [] },
      ctx,
      TENANT,
    );
    expect(result.response).toContain('RRHH');
  });
});

// ─── 3. Wrappers de skills (resolución por nombre / nº / equipo) ───────────

describe('skills — RRHH', () => {
  it('approve_vacation_voice resuelve el nombre del empleado a su solicitud pendiente', async () => {
    mocks.employeeFindFirst.mockResolvedValue(EMPLOYEE_MARIA as any);
    mocks.vacationFindFirst.mockResolvedValue(PENDING_VACATION as any);
    mocks.vacationUpdate.mockResolvedValue({ ...PENDING_VACATION, status: 'APPROVED', approvedById: 'user-1' } as any);

    const result = await (skills as any).approve_vacation_voice({
      tenantId: TENANT,
      nombre: 'María',
      nota: 'Disfruta tus días',
      userId: 'user-1',
    });

    expect(mocks.employeeFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: TENANT,
          fullName: { contains: 'María', mode: 'insensitive' },
          isActive: true,
        }),
      }),
    );
    expect(mocks.vacationFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId: TENANT, employeeId: 'emp-1', status: 'PENDING' } }),
    );
    expect(mocks.vacationUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: PENDING_VACATION.id, tenantId: TENANT },
        data: expect.objectContaining({ status: 'APPROVED', approvedById: 'user-1' }),
      }),
    );
    expect(result.text).toContain('autorizada');
    expect(result.empleadoNombre).toBe('María López');
  });

  it('approve_vacation_voice acepta el id cuid de la solicitud directamente', async () => {
    mocks.vacationFindUnique.mockResolvedValue({
      ...PENDING_VACATION,
      erp_employees: { fullName: 'María López' },
    } as any);
    mocks.vacationUpdate.mockResolvedValue({ ...PENDING_VACATION, status: 'APPROVED' } as any);

    const result = await (skills as any).approve_vacation_voice({
      tenantId: TENANT,
      solicitudId: PENDING_VACATION.id,
    });

    expect(mocks.vacationFindUnique).toHaveBeenCalled();
    expect(result.empleadoNombre).toBe('María López');
  });

  it('approve_vacation_voice sin solicitud pendiente del empleado da error claro', async () => {
    mocks.employeeFindFirst.mockResolvedValue(EMPLOYEE_CARLOS as any);
    mocks.vacationFindFirst.mockResolvedValue(null);

    await expect(
      (skills as any).approve_vacation_voice({ tenantId: TENANT, nombre: 'Carlos' }),
    ).rejects.toThrow('no tiene solicitudes de vacaciones pendientes');
  });

  it('talent_retention_risk analiza un empleado concreto por nombre', async () => {
    mocks.employeeFindFirst.mockResolvedValue(EMPLOYEE_MARIA as any);
    mocks.employeeFindUnique.mockResolvedValue({ ...EMPLOYEE_MARIA, user: null } as any);
    mocks.taskCount.mockResolvedValue(12);

    const result = await (skills as any).talent_retention_risk({
      tenantId: TENANT,
      nombre: 'María',
    });

    expect(result.employeeName).toBe('María López');
    expect(result.riskLevel).toBe('HIGH');
    expect(result.factors.workload).toContain('12 tareas');
  });

  it('talent_retention_risk sin empleado analiza todo el equipo y agrega por riesgo', async () => {
    mocks.employeeFindMany.mockResolvedValue([EMPLOYEE_MARIA, EMPLOYEE_CARLOS] as any);
    mocks.employeeFindUnique
      .mockResolvedValueOnce({ ...EMPLOYEE_MARIA, user: null } as any)
      .mockResolvedValueOnce({ ...EMPLOYEE_CARLOS, user: null } as any);
    mocks.taskCount.mockResolvedValueOnce(12).mockResolvedValueOnce(3);

    const result = await (skills as any).talent_retention_risk({ tenantId: TENANT });

    expect(result.teamAnalysis).toBe(true);
    expect(result.analyzed).toBe(2);
    expect(result.highRisk).toBe(1);
    expect(result.mostAtRisk.employeeName).toBe('María López');
    expect(result.summary).toContain('María López');
    expect(result.summary).toContain('Carlos Ruiz');
  });
});

// ─── 4. Formateadores del ExecutionEngine ───────────────────────────────────

describe('ExecutionEngine.formatSkillResult — RRHH', () => {
  it('get_hr_daily_brief muestra el texto del briefing', () => {
    const msg = ExecutionEngine.formatSkillResult('get_hr_daily_brief', {
      text: 'ESTADO DE FUERZA: Hoy contamos con el 80% del equipo activo.',
      metrics: { activeCount: 8, totalCount: 10 },
    });
    expect(msg).toContain('80% del equipo activo');
    expect(msg).toContain('ESTADO DE FUERZA');
  });

  it('get_hr_daily_brief sin texto formatea las métricas', () => {
    const msg = ExecutionEngine.formatSkillResult('get_hr_daily_brief', {
      metrics: { activeCount: 8, totalCount: 10, absentCount: 2, integrityAlerts: 1, criticalConflicts: [] },
    });
    const plain = msg.replace(/\\/g, '');
    expect(plain).toContain('8 de 10');
    expect(plain).toContain('2 ausentes');
  });

  it('approve_vacation_voice confirma la aprobación con empleado y fechas', () => {
    const msg = ExecutionEngine.formatSkillResult('approve_vacation_voice', {
      text: 'Solicitud autorizada correctamente.',
      empleadoNombre: 'María López',
      vacation: { startDate: '2026-08-20T00:00:00.000Z', endDate: '2026-08-27T00:00:00.000Z' },
    });
    const plain = msg.replace(/\\/g, '');
    expect(plain).toContain('Vacaciones aprobadas');
    expect(plain).toContain('María López');
    expect(plain).toContain('2026-08-20');
    expect(plain).toContain('2026-08-27');
  });

  it('talent_retention_risk individual muestra nivel y recomendación', () => {
    const msg = ExecutionEngine.formatSkillResult('talent_retention_risk', {
      employeeName: 'María López',
      riskLevel: 'HIGH',
      factors: { workload: '12 tareas pendientes', trainingMaturity: '85% de capacitación completada' },
      recommendation: 'Se recomienda redistribuir tareas.',
    });
    const plain = msg.replace(/\\/g, '');
    expect(plain).toContain('Riesgo de rotación — María López');
    expect(plain).toContain('HIGH');
    expect(plain).toContain('12 tareas');
    expect(plain).toContain('redistribuir');
  });

  it('talent_retention_risk de equipo resume conteos y mayor riesgo', () => {
    const msg = ExecutionEngine.formatSkillResult('talent_retention_risk', {
      teamAnalysis: true,
      analyzed: 3,
      highRisk: 1,
      mediumRisk: 1,
      summary: '• María López: HIGH\n• Carlos Ruiz: MEDIUM',
      mostAtRisk: { employeeName: 'María López', riskLevel: 'HIGH' },
    });
    const plain = msg.replace(/\\/g, '');
    expect(plain).toContain('Riesgo de rotación del equipo');
    expect(plain).toContain('Alto: 1');
    expect(plain).toContain('Medio: 1');
    expect(plain).toContain('María López');
  });
});
