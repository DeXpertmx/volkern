// @vitest-environment node

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  tenantFindUnique: vi.fn(),
  subscriptionPlanFindUnique: vi.fn(),
  userFindFirst: vi.fn(),
  adCampaignFindFirst: vi.fn(),
  adScheduleFindFirst: vi.fn(),
  adScheduleFindUnique: vi.fn(),
  adScheduleCreate: vi.fn(),
  adScheduleFindMany: vi.fn(),
  adScheduleDelete: vi.fn(),
  adABTestFindUnique: vi.fn(),
  adABTestFindFirst: vi.fn(),
  adABTestCreate: vi.fn(),
  adABTestUpdate: vi.fn(),
  adABTestVariantCreate: vi.fn(),
  adABTestVariantFindFirst: vi.fn(),
  socialAnalyticsFindMany: vi.fn(),
  contactCount: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    tenant: { findUnique: mocks.tenantFindUnique },
    subscriptionPlan: { findUnique: mocks.subscriptionPlanFindUnique },
    user: { findFirst: mocks.userFindFirst },
    adCampaign: { findFirst: mocks.adCampaignFindFirst },
    adSchedule: {
      findFirst: mocks.adScheduleFindFirst,
      findUnique: mocks.adScheduleFindUnique,
      create: mocks.adScheduleCreate,
      findMany: mocks.adScheduleFindMany,
      delete: mocks.adScheduleDelete,
    },
    adABTest: {
      findUnique: mocks.adABTestFindUnique,
      findFirst: mocks.adABTestFindFirst,
      create: mocks.adABTestCreate,
      update: mocks.adABTestUpdate,
    },
    adABTestVariant: {
      create: mocks.adABTestVariantCreate,
      findFirst: mocks.adABTestVariantFindFirst,
    },
    socialAnalytics: { findMany: mocks.socialAnalyticsFindMany },
    contact: { count: mocks.contactCount },
  },
}));

vi.mock('@/lib/skills/event-bus', () => ({
  eventBus: { emitEvent: vi.fn() },
  EVENTS: {},
}));

vi.mock('@/lib/assistant/openrouter-client', () => ({
  callWebCreatorWithFallback: vi.fn().mockResolvedValue({
    choices: [{
      message: {
        content: JSON.stringify({
          html: '<div class="hero">Hola</div>',
          css: '',
          description: 'Bloque hero profesional para mi producto',
          traits: [],
        }),
      },
    }],
  }),
}));

const { marketingIntents } = await import('@/lib/agents/intents/marketing-intents');
const { SkillOrchestratorAgent } = await import('@/lib/agents/skill-orchestrator');
const { skills } = await import('@/lib/skills');
const { ExecutionEngine } = await import('@/lib/agents/execution-engine');

const TENANT = 'tenant-1';

// 'campanas' y 'ads' están en ALL_FEATURES_SET → el plan premium sin overrides
// habilita ambos módulos automáticamente.
const TENANT_FIXTURE = {
  id: TENANT,
  plan: 'premium',
  tenantFeatures: [],
};

const CAMPAIGN_FIXTURE = { id: 'camp-1', name: 'Campaña de verano' };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.tenantFindUnique.mockResolvedValue(TENANT_FIXTURE as any);
  mocks.subscriptionPlanFindUnique.mockResolvedValue(null); // → fallback PLAN_MODULES
  mocks.userFindFirst.mockResolvedValue({ id: 'user-1' } as any);
});

// ─── 1. Intents registrados ─────────────────────────────────────────────────

describe('marketing-intents', () => {
  it('registra los 13 intents de marketing/ads', () => {
    const names = marketingIntents.map(i => i.name);
    for (const n of [
      'generar_copy', 'analizar_sentimiento', 'sugerir_campania',
      'generar_web_block', 'generar_seo', 'sugerir_automatizacion',
      'programar_campania', 'listar_horarios', 'eliminar_horario',
      'crear_test_ab', 'iniciar_test_ab', 'evaluar_test_ab', 'declarar_ganador',
    ]) {
      expect(names).toContain(n);
    }
  });

  it('generar_copy exige tema; programar_campania exige campania+accion; eliminar_horario es destructive', () => {
    const copy = marketingIntents.find(i => i.name === 'generar_copy')!;
    const prog = marketingIntents.find(i => i.name === 'programar_campania')!;
    const del = marketingIntents.find(i => i.name === 'eliminar_horario')!;
    expect(copy.requiredParams).toEqual(['tema']);
    expect(copy.optionalParams).toContain('tono');
    expect(prog.requiredParams).toContain('campania');
    expect(prog.requiredParams).toContain('accion');
    expect(del.requiredParams).toEqual(['programacion']);
    expect(del.destructive).toBe(true);
  });

  it('los intents de generación NO son destructive (excepto eliminar/declarar)', () => {
    const del = new Set(['eliminar_horario', 'declarar_ganador']);
    for (const intent of marketingIntents) {
      if (!del.has(intent.name)) {
        expect(intent.destructive).toBe(false);
      }
    }
  });
});

// ─── 2. Mapping orchestrator: intent → skill ───────────────────────────────

describe('SkillOrchestrator — wiring de marketing/ads', () => {
  const ctx = {
    tenantId: TENANT,
    userId: 'user-1',
    pendingIntent: '',
    collectedEntities: {},
    missingEntities: [],
  };

  it('los 6 intents de marketing mapean a sus skills', async () => {
    const cases: Array<[string, Record<string, string>, string]> = [
      ['generar_copy', { tema: 'nuestro producto' }, 'generate_marketing_copy'],
      ['analizar_sentimiento', { texto: 'El servicio fue excelente' }, 'analyze_marketing_sentiment'],
      ['sugerir_campania', {}, 'suggest_campaign_optimization'],
      ['generar_web_block', { tipoBloque: 'hero', producto: 'mi producto' }, 'generate_web_creator_block'],
      ['generar_seo', { tituloPagina: 'servicios' }, 'generate_seo_metadata'],
      ['sugerir_automatizacion', {}, 'advise_on_automation_rules'],
    ];
    for (const [intent, entities, skill] of cases) {
      const result = await SkillOrchestratorAgent.createPlan({ intent, entities, missingEntities: [] }, ctx, TENANT);
      expect(result.plan?.steps[0].action).toBe(skill);
    }
  });

  it('los 7 intents de ads mapean a sus skills', async () => {
    const cases: Array<[string, Record<string, string>, string]> = [
      ['programar_campania', { campania: 'verano', accion: 'PAUSE' }, 'create_ad_schedule'],
      ['listar_horarios', {}, 'list_ad_schedules'],
      ['eliminar_horario', { programacion: 'verano' }, 'delete_ad_schedule'],
      ['crear_test_ab', { campania: 'verano', nombre: 'Test A/B — verano' }, 'create_ab_test'],
      ['iniciar_test_ab', { test: 'verano' }, 'start_ab_test'],
      ['evaluar_test_ab', { test: 'verano' }, 'calculate_ab_test_significance'],
      ['declarar_ganador', { test: 'verano' }, 'declare_ab_test_winner'],
    ];
    for (const [intent, entities, skill] of cases) {
      const result = await SkillOrchestratorAgent.createPlan({ intent, entities, missingEntities: [] }, ctx, TENANT);
      expect(result.plan?.steps[0].action).toBe(skill);
    }
  });

  it('sin acceso al módulo campanas (plan basico) devuelve el mensaje de no acceso', async () => {
    mocks.tenantFindUnique.mockResolvedValue({ id: TENANT, plan: 'basico', tenantFeatures: [] } as any);
    const result = await SkillOrchestratorAgent.createPlan(
      { intent: 'generar_copy', entities: { tema: 'x' }, missingEntities: [] },
      ctx,
      TENANT,
    );
    expect(result.response).toContain('Marketing');
  });
});

// ─── 3. Wrappers de skills (mapeo de nombres ES → params del core) ─────────

describe('skills — marketing', () => {
  it('generate_marketing_copy mapea tema → topic y formato → platform', async () => {
    const result = await (skills as any).generate_marketing_copy({
      tenantId: TENANT,
      tema: 'nuestro nuevo producto',
      formato: 'LINKEDIN',
      tono: 'professional',
    });
    expect(result.topic).toBe('nuestro nuevo producto');
    expect(result.platform).toBe('LINKEDIN');
    expect(result.tone).toBe('professional');
  });

  it('generate_marketing_copy sin tema lanza error claro', async () => {
    await expect((skills as any).generate_marketing_copy({ tenantId: TENANT })).rejects.toThrow('tema');
  });

  it('analyze_marketing_sentiment mapea texto → text', async () => {
    const result = await (skills as any).analyze_marketing_sentiment({
      tenantId: TENANT,
      texto: 'El servicio fue excelente',
    });
    expect(result.text).toBe('El servicio fue excelente');
    expect(['POSITIVE', 'NEUTRAL', 'NEGATIVE']).toContain(result.sentiment);
  });

  it('generate_web_creator_block mapea tipoBloque → category y producto → description', async () => {
    const result = await (skills as any).generate_web_creator_block({
      tenantId: TENANT,
      tipoBloque: 'hero',
      producto: 'mi producto',
    });
    // El core recibe category="hero" y description="mi producto" y devuelve el
    // HTML generado con su descripción
    expect(result.html).toContain('hero');
    expect(result.description).toContain('Bloque hero');
  });

  it('generate_seo_metadata mapea tituloPagina → pageTitle', async () => {
    const result = await (skills as any).generate_seo_metadata({
      tenantId: TENANT,
      tituloPagina: 'servicios',
      contenido: 'Nuestros servicios de consultoría',
    });
    expect(result.metaTitulo).toContain('servicios');
    expect(result.metaDescripcion).toContain('Nuestros servicios');
    expect(result.metaKeywords).toContain('servicios');
  });

  it('advise_on_automation_rules detecta clientes inactivos', async () => {
    mocks.contactCount.mockResolvedValue(80);
    const result = await (skills as any).advise_on_automation_rules({ tenantId: TENANT });
    expect(result.suggestions.length).toBeGreaterThanOrEqual(2);
    expect(result.suggestions[0].name).toContain('Reactivación');
  });
});

describe('skills — ADS', () => {
  it('create_ad_schedule resuelve la campaña por nombre y crea la programación', async () => {
    mocks.adCampaignFindFirst.mockResolvedValue(CAMPAIGN_FIXTURE as any);
    mocks.adScheduleCreate.mockResolvedValue({
      id: 'sch-1',
      name: 'Pausa — verano',
      campaign: { name: 'Campaña de verano' },
    } as any);

    const result = await (skills as any).create_ad_schedule({
      tenantId: TENANT,
      campania: 'verano',
      accion: 'PAUSE',
      dias: 'SAT,SUN',
      horaInicio: '22:00',
      horaFin: '06:00',
    });

    expect(mocks.adCampaignFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ tenantId: TENANT, name: expect.objectContaining({ contains: 'verano' }) }) }),
    );
    expect(mocks.adScheduleCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: TENANT,
          campaignId: 'camp-1',
          daysOfWeek: ['SAT', 'SUN'],
          startTime: '22:00',
          endTime: '06:00',
          action: 'PAUSE',
        }),
      }),
    );
    expect(result.success).toBe(true);
  });

  it('list_ad_schedules lista las programaciones del tenant', async () => {
    mocks.adScheduleFindMany.mockResolvedValue([
      { id: 'sch-1', name: 'Pausa — verano', enabled: true, daysOfWeek: ['SAT', 'SUN'], startTime: '22:00', endTime: '06:00', campaign: { name: 'Campaña de verano' } },
    ] as any);
    const result = await (skills as any).list_ad_schedules({ tenantId: TENANT });
    expect(result.total).toBe(1);
    expect(mocks.adScheduleFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: { tenantId: TENANT } }));
  });

  it('create_ab_test resuelve la campaña y sintetiza el nombre', async () => {
    mocks.adCampaignFindFirst.mockResolvedValue(CAMPAIGN_FIXTURE as any);
    mocks.adABTestCreate.mockResolvedValue({ id: 'test-1' } as any);
    mocks.adABTestVariantCreate.mockResolvedValue({});
    mocks.adABTestFindUnique.mockResolvedValue({ id: 'test-1', name: 'Test A/B — verano', campaign: { name: 'Campaña de verano' } } as any);

    const result = await (skills as any).create_ab_test({
      tenantId: TENANT,
      campania: 'verano',
      nombre: 'Test A/B — verano',
    });

    expect(mocks.adABTestCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ tenantId: TENANT, campaignId: 'camp-1', name: 'Test A/B — verano', status: 'DRAFT' }),
      }),
    );
    expect(mocks.adABTestVariantCreate).toHaveBeenCalledTimes(2);
    expect(result.success).toBe(true);
  });

  it('start_ab_test resuelve el test por nombre de campaña y lo inicia', async () => {
    mocks.adABTestFindFirst.mockResolvedValue({ id: 'test-1' } as any);
    mocks.adABTestUpdate.mockResolvedValue({ id: 'test-1', name: 'Test A/B — verano' } as any);

    const result = await (skills as any).start_ab_test({ tenantId: TENANT, test: 'verano' });

    expect(mocks.adABTestFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: TENANT, OR: expect.any(Array) }),
      }),
    );
    expect(mocks.adABTestUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'test-1' }, data: expect.objectContaining({ status: 'RUNNING' }) }),
    );
    expect(result.success).toBe(true);
  });

  it('delete_ad_schedule resuelve la programación por nombre de campaña y la elimina', async () => {
    mocks.adScheduleFindFirst
      .mockResolvedValueOnce(null) // por nombre de programación
      .mockResolvedValueOnce({ id: 'sch-1', name: 'Pausa — verano' } as any); // por campaignId
    mocks.adCampaignFindFirst.mockResolvedValue({ id: 'camp-1' } as any);
    mocks.adScheduleFindUnique.mockResolvedValue({ id: 'sch-1', name: 'Pausa — verano' } as any);
    mocks.adScheduleDelete.mockResolvedValue({} as any);

    const result = await (skills as any).delete_ad_schedule({ tenantId: TENANT, programacion: 'verano' });

    expect(result.success).toBe(true);
    expect(mocks.adScheduleDelete).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'sch-1' } }));
  });
});

// ─── 4. Formateadores del ExecutionEngine ───────────────────────────────────

describe('ExecutionEngine.formatSkillResult — marketing/ads', () => {
  it('generate_marketing_copy muestra el copy generado', () => {
    const msg = ExecutionEngine.formatSkillResult('generate_marketing_copy', {
      copy: 'Aquí tienes una propuesta de copy para nuestro producto',
      platform: 'EMAIL',
      tone: 'professional',
    });
    const plain = msg.replace(/\\/g, '');
    expect(plain).toContain('Copy generado');
    expect(plain).toContain('propuesta de copy');
  });

  it('analyze_marketing_sentiment muestra el sentimiento con icono', () => {
    const msg = ExecutionEngine.formatSkillResult('analyze_marketing_sentiment', {
      sentiment: 'POSITIVE',
      score: 0.95,
      text: 'El servicio fue excelente',
    });
    const plain = msg.replace(/\\/g, '');
    expect(plain).toContain('Sentimiento');
    expect(plain).toContain('POSITIVE');
    expect(plain).toContain('excelente');
  });

  it('generate_seo_metadata muestra title, description y keywords', () => {
    const msg = ExecutionEngine.formatSkillResult('generate_seo_metadata', {
      metaTitulo: 'Servicios | Volkern',
      metaDescripcion: 'Descubre cómo Servicios puede transformar tu negocio',
      metaKeywords: 'servicios, volkern, crm',
    });
    const plain = msg.replace(/\\/g, '');
    expect(plain).toContain('SEO generado');
    expect(plain).toContain('Servicios | Volkern');
    expect(plain).toContain('Keywords');
  });

  it('list_ad_schedules formatea las programaciones con días y horario', () => {
    const msg = ExecutionEngine.formatSkillResult('list_ad_schedules', {
      schedules: [
        { id: 's1', name: 'Pausa — verano', enabled: true, daysOfWeek: ['SAT', 'SUN'], startTime: '22:00', endTime: '06:00', campaign: { name: 'Campaña de verano' } },
      ],
      total: 1,
    });
    const plain = msg.replace(/\\/g, '');
    expect(plain).toContain('Programaciones');
    expect(plain).toContain('Campaña de verano');
    expect(plain).toContain('sat,sun');
    expect(plain).toContain('22:00');
  });

  it('list_ad_schedules vacío muestra mensaje', () => {
    const msg = ExecutionEngine.formatSkillResult('list_ad_schedules', { schedules: [], total: 0 });
    expect(msg).toContain('No hay programaciones activas');
  });

  it('calculate_ab_test_significance muestra la significancia del skill', () => {
    const msg = ExecutionEngine.formatSkillResult('calculate_ab_test_significance', {
      message: 'El test aún no alcanza significancia (p=0.310, umbral=0.950)',
    });
    expect(msg).toContain('no alcanza significancia');
  });
});
