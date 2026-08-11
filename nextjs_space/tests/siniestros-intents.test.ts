// @vitest-environment node

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  tenantFindUnique: vi.fn(),
  subscriptionPlanFindUnique: vi.fn(),
  polizaFindFirst: vi.fn(),
  contactFindFirst: vi.fn(),
  aseguradoraFindFirst: vi.fn(),
  userFindFirst: vi.fn(),
  siniestroCreate: vi.fn(),
  siniestroFindFirst: vi.fn(),
  siniestroFindMany: vi.fn(),
  siniestroCount: vi.fn(),
  siniestroUpdate: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    tenant: { findUnique: mocks.tenantFindUnique },
    subscriptionPlan: { findUnique: mocks.subscriptionPlanFindUnique },
    poliza: { findFirst: mocks.polizaFindFirst },
    contact: { findFirst: mocks.contactFindFirst },
    aseguradora: { findFirst: mocks.aseguradoraFindFirst },
    user: { findFirst: mocks.userFindFirst },
    siniestro: {
      create: mocks.siniestroCreate,
      findFirst: mocks.siniestroFindFirst,
      findMany: mocks.siniestroFindMany,
      count: mocks.siniestroCount,
      update: mocks.siniestroUpdate,
    },
  },
}));

vi.mock('@/lib/skills/event-bus', () => ({
  eventBus: { emitEvent: vi.fn() },
  EVENTS: {},
}));

const { insuranceIntents } = await import('@/lib/agents/intents/insurance-intents');
const { SkillOrchestratorAgent } = await import('@/lib/agents/skill-orchestrator');
const { skills } = await import('@/lib/skills');
const { ExecutionEngine } = await import('@/lib/agents/execution-engine');

const TENANT = 'tenant-1';
const POLIZA_ID = 'poliza-1';
const SINIESTRO_ID = 'siniestro-1';

// Tenant con plan 'premium' (fallback → esencial → insurance activo, sin BD).
const TENANT_FIXTURE = { id: TENANT, plan: 'premium', tenantFeatures: [] };
const POLIZA_FIXTURE = {
  id: POLIZA_ID,
  numeroPoliza: 'P-AXA-2026-001',
  clienteId: 'cliente-1',
  aseguradoraId: 'aseguradora-1',
  moneda: 'EUR',
};
const SINIESTRO_FIXTURE = {
  id: SINIESTRO_ID,
  tenantId: TENANT,
  polizaId: POLIZA_ID,
  clienteId: 'cliente-1',
  aseguradoraId: 'aseguradora-1',
  descripcion: 'Choque lateral',
  estado: 'REPORTADO',
  moneda: 'EUR',
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.tenantFindUnique.mockResolvedValue(TENANT_FIXTURE as any);
  mocks.subscriptionPlanFindUnique.mockResolvedValue(null); // → fallback PLAN_MODULES
  mocks.polizaFindFirst.mockResolvedValue(POLIZA_FIXTURE as any);
  mocks.userFindFirst.mockResolvedValue({ id: 'user-1' } as any);
});

// ─── 1. Intents registrados ─────────────────────────────────────────────────

describe('insurance-intents — siniestros', () => {
  it('registra los 3 intents de siniestros', () => {
    const names = insuranceIntents.map(i => i.name);
    expect(names).toContain('crear_siniestro');
    expect(names).toContain('listar_siniestros');
    expect(names).toContain('actualizar_siniestro');
  });

  it('crear_siniestro exige poliza + descripcion', () => {
    const intent = insuranceIntents.find(i => i.name === 'crear_siniestro')!;
    expect(intent.requiredParams).toContain('poliza');
    expect(intent.requiredParams).toContain('descripcion');
    expect(intent.destructive).toBe(false);
  });

  it('actualizar_siniestro exige siniestro y acepta estado/montoIndemnizado/motivoRechazo', () => {
    const intent = insuranceIntents.find(i => i.name === 'actualizar_siniestro')!;
    expect(intent.requiredParams).toEqual(['siniestro']);
    expect(intent.optionalParams).toEqual(
      expect.arrayContaining(['estado', 'montoIndemnizado', 'motivoRechazo', 'notas', 'fechaCierre']),
    );
  });
});

// ─── 2. Mapping orchestrator: intent → skill ───────────────────────────────

describe('SkillOrchestrator — wiring de siniestros', () => {
  const ctx = {
    tenantId: TENANT,
    userId: 'user-1',
    pendingIntent: '',
    collectedEntities: {},
    missingEntities: [],
  };

  it('crear_siniestro genera un plan de 1 paso hacia create_siniestro', async () => {
    const result = await SkillOrchestratorAgent.createPlan(
      { intent: 'crear_siniestro', entities: { poliza: 'P-AXA-2026-001', descripcion: 'Choque lateral' }, missingEntities: [] },
      ctx,
      TENANT,
    );
    expect(result.success).toBe(true);
    expect(result.plan?.steps[0].action).toBe('create_siniestro');
    expect(result.plan?.steps[0].params).toMatchObject({
      tenantId: TENANT,
      poliza: 'P-AXA-2026-001',
      descripcion: 'Choque lateral',
    });
  });

  it('listar_siniestros genera un plan hacia list_siniestros', async () => {
    const result = await SkillOrchestratorAgent.createPlan(
      { intent: 'listar_siniestros', entities: { estado: 'ABIERTO' }, missingEntities: [] },
      ctx,
      TENANT,
    );
    expect(result.plan?.steps[0].action).toBe('list_siniestros');
    expect(result.plan?.steps[0].params).toMatchObject({ tenantId: TENANT, estado: 'ABIERTO' });
  });

  it('actualizar_siniestro genera un plan hacia update_siniestro', async () => {
    const result = await SkillOrchestratorAgent.createPlan(
      { intent: 'actualizar_siniestro', entities: { siniestro: 'SIN-DEMO-001', estado: 'pagado', montoIndemnizado: '1200' }, missingEntities: [] },
      ctx,
      TENANT,
    );
    expect(result.plan?.steps[0].action).toBe('update_siniestro');
    expect(result.plan?.steps[0].params).toMatchObject({ siniestro: 'SIN-DEMO-001', estado: 'pagado' });
  });

  it('sin acceso al módulo insurance devuelve el mensaje de no acceso', async () => {
    mocks.tenantFindUnique.mockResolvedValue({ id: TENANT, plan: 'basico-sin-insurance', tenantFeatures: [] } as any);
    // fuerza un plan sin insurance mockeando el fallback con un slug desconocido
    mocks.subscriptionPlanFindUnique.mockResolvedValue({
      slug: 'x',
      nombre: 'X',
      precio: 0,
      moneda: 'eur',
      intervalo: 'mensual',
      limiteUsuarios: 1,
      limiteLeads: 10,
      limiteStorage: 1,
      limiteCursos: 0,
      limiteEstudiantes: 0,
      features: { modules: ['crm'] },
      whitelabelHabilitado: false,
      dominioPersonalizadoHabilitado: false,
    } as any);
    const result = await SkillOrchestratorAgent.createPlan(
      { intent: 'crear_siniestro', entities: { poliza: 'X', descripcion: 'Y' }, missingEntities: [] },
      ctx,
      TENANT,
    );
    expect(result.response).toContain('Seguros');
  });
});

// ─── 3. Wrappers de skills (resolución + normalización) ─────────────────────

describe('skills — siniestros', () => {
  it('create_siniestro resuelve la póliza por número y crea con cliente/aseguradora derivados', async () => {
    mocks.siniestroCreate.mockResolvedValue({ ...SINIESTRO_FIXTURE, numeroSiniestro: 'SIN-1' } as any);

    const result = await (skills as any).create_siniestro({
      tenantId: TENANT,
      poliza: 'P-AXA-2026-001',
      descripcion: 'Choque lateral',
      montoReclamado: '1500',
      userId: 'user-1',
    });

    expect(mocks.polizaFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: TENANT, numeroPoliza: { contains: 'P-AXA-2026-001', mode: 'insensitive' } },
      }),
    );
    expect(mocks.siniestroCreate).toHaveBeenCalledTimes(1);
    const data = mocks.siniestroCreate.mock.calls[0][0].data;
    expect(data.polizaId).toBe(POLIZA_ID);
    expect(data.clienteId).toBe('cliente-1');
    expect(data.aseguradoraId).toBe('aseguradora-1');
    expect(data.montoReclamado).toBe(1500);
    expect(data.estado).toBe('REPORTADO');
    expect(result.message).toContain('REPORTADO');
  });

  it('update_siniestro normaliza "en trámite" → EN_TRAMITE y resuelve por numeroSiniestro', async () => {
    mocks.siniestroFindFirst.mockResolvedValueOnce({ id: SINIESTRO_ID, estado: 'REPORTADO' } as any) // resolveSiniestroId
      .mockResolvedValueOnce({ id: SINIESTRO_ID, estado: 'REPORTADO' } as any); // updateEstadoSiniestro
    mocks.siniestroUpdate.mockResolvedValue({ ...SINIESTRO_FIXTURE, estado: 'EN_TRAMITE' } as any);

    const result = await (skills as any).update_siniestro({
      tenantId: TENANT,
      siniestro: 'SIN-1',
      estado: 'en trámite',
      notas: 'Documentación enviada',
    });

    expect(mocks.siniestroFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ numeroSiniestro: { contains: 'SIN-1', mode: 'insensitive' } }),
      }),
    );
    const updateArgs = mocks.siniestroUpdate.mock.calls[0][0];
    expect(updateArgs.where.id).toBe(SINIESTRO_ID);
    expect(updateArgs.data.estado).toBe('EN_TRAMITE');
    expect(result.message).toContain('EN_TRAMITE');
  });

  it('update_siniestro rechaza transición ilegal con el mensaje real del skill', async () => {
    mocks.siniestroFindFirst.mockResolvedValueOnce({ id: SINIESTRO_ID, estado: 'CERRADO' } as any)
      .mockResolvedValueOnce({ id: SINIESTRO_ID, estado: 'CERRADO' } as any);

    await expect(
      (skills as any).update_siniestro({ tenantId: TENANT, siniestro: 'SIN-1', estado: 'abierto' }),
    ).rejects.toThrow(/Transición de estado no permitida/);
  });

  it('list_siniestros filtra por estado y resuelve cliente por nombre', async () => {
    mocks.contactFindFirst.mockResolvedValue({ id: 'cliente-1' } as any);
    mocks.siniestroFindMany.mockResolvedValue([SINIESTRO_FIXTURE] as any);
    mocks.siniestroCount.mockResolvedValue(1);

    const result = await (skills as any).list_siniestros({
      tenantId: TENANT,
      estado: 'REPORTADO',
      cliente: 'Carlos Mendoza',
    });

    expect(mocks.contactFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId: TENANT, nombre: { contains: 'Carlos Mendoza', mode: 'insensitive' } } }),
    );
    const findManyArgs = mocks.siniestroFindMany.mock.calls[0][0];
    expect(findManyArgs.where).toMatchObject({ tenantId: TENANT, estado: 'REPORTADO', clienteId: 'cliente-1' });
    expect(result.total).toBe(1);
  });
});

// ─── 4. Formateadores del ExecutionEngine ───────────────────────────────────

describe('ExecutionEngine.formatSkillResult — siniestros', () => {
  it('list_siniestros lista hasta 5 con total y sufijo', () => {
    const items = Array.from({ length: 7 }, (_, i) => ({
      numeroSiniestro: `SIN-${i + 1}`,
      estado: 'ABIERTO',
      cliente: { nombre: `Cliente ${i + 1}` },
      aseguradora: { nombre: 'AXA' },
      montoReclamado: 1000 + i,
      moneda: 'EUR',
    }));
    const msg = ExecutionEngine.formatSkillResult('list_siniestros', { siniestros: items, total: 7 });
    expect(msg).toContain('Siniestros (7)');
    // Los caracteres especiales van escapados para Markdown de Telegram (SIN\-1)
    const plain = msg.replace(/\\/g, '');
    expect(plain).toContain('SIN-1');
    expect(plain).toContain('ABIERTO');
    expect(plain).toContain('AXA');
    expect(plain).not.toContain('SIN-6');
    expect(msg).toContain('y 2 más');
  });

  it('list_siniestros vacío muestra mensaje de ausencia', () => {
    const msg = ExecutionEngine.formatSkillResult('list_siniestros', { siniestros: [], total: 0 });
    expect(msg).toBe('🛡️ No hay siniestros registrados.');
  });

  it('create/update_siniestro muestran el mensaje del skill', () => {
    const msg = ExecutionEngine.formatSkillResult('create_siniestro', {
      message: 'Siniestro abc creado en estado REPORTADO para póliza P-1.',
    });
    const plain = msg.replace(/\\/g, '');
    expect(plain).toContain('Siniestro abc creado');
    expect(plain).toContain('REPORTADO');
  });
});
