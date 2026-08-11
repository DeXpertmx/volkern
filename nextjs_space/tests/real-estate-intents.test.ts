// @vitest-environment node

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  tenantFindUnique: vi.fn(),
  subscriptionPlanFindUnique: vi.fn(),
  userFindFirst: vi.fn(),
  catalogoItemFindFirst: vi.fn(),
  dealFindFirst: vi.fn(),
  dealFindUnique: vi.fn(),
  tenantFindFirst: vi.fn(),
  comisionCreate: vi.fn(),
  queryRawUnsafe: vi.fn(),
  aiChat: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    tenant: { findUnique: mocks.tenantFindUnique, findFirst: mocks.tenantFindFirst },
    subscriptionPlan: { findUnique: mocks.subscriptionPlanFindUnique },
    user: { findFirst: mocks.userFindFirst },
    catalogoItem: { findFirst: mocks.catalogoItemFindFirst },
    deal: { findFirst: mocks.dealFindFirst, findUnique: mocks.dealFindUnique },
    comision: { create: mocks.comisionCreate },
    $queryRawUnsafe: mocks.queryRawUnsafe,
  },
}));

vi.mock('@/lib/skills/event-bus', () => ({
  eventBus: { emitEvent: vi.fn() },
  EVENTS: {},
}));

vi.mock('@/lib/event-engine/ai-engine/ai-engine', () => ({
  AIEngine: { chat: mocks.aiChat },
}));

vi.mock('@/lib/real-estate/property-helpers', () => ({
  parseInmueble: vi.fn((p: any) => ({
    propertyType: p.customFieldValues?.tipo_inmueble || 'Departamento',
    operationType: p.customFieldValues?.tipo_operacion || 'venta',
    precioBase: p.precioBase || 250000,
    city: p.customFieldValues?.zona || 'Madrid',
    address: p.customFieldValues?.direccion || '',
    areaM2: Number(p.customFieldValues?.superficie_total) || 100,
    bedrooms: Number(p.customFieldValues?.habitaciones) || 3,
    bathrooms: Number(p.customFieldValues?.banos) || 2,
  })),
  getPropertyWithFields: vi.fn(async (_id: string, _tenantId: string) => ({
    id: 'prop-1',
    nombre: 'Ático en el centro',
    descripcion: 'Ático luminoso en el centro de Madrid con terraza.',
    precioBase: 350000,
    customFieldValues: { zona: 'Centro', tipo_inmueble: 'Departamento', tipo_operacion: 'venta', superficie_total: '120', habitaciones: '3', banos: '2' },
    media: [],
  })),
  updatePropertyCustomFields: vi.fn(async () => {}),
}));

const { realEstateIntents } = await import('@/lib/agents/intents/real-estate-intents');
const { SkillOrchestratorAgent } = await import('@/lib/agents/skill-orchestrator');
const { skills } = await import('@/lib/skills');
const { ExecutionEngine } = await import('@/lib/agents/execution-engine');

const TENANT = 'tenant-1';

const TENANT_FIXTURE = {
  id: TENANT,
  plan: 'premium',
  tenantFeatures: [],
};

const PROPERTY_FIXTURE = { id: 'prop-1', nombre: 'Ático en el centro', sku: 'PROP-001' };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.tenantFindUnique.mockResolvedValue(TENANT_FIXTURE as any);
  mocks.subscriptionPlanFindUnique.mockResolvedValue(null); // → fallback PLAN_MODULES
  mocks.userFindFirst.mockResolvedValue({ id: 'user-1' } as any);
  mocks.catalogoItemFindFirst.mockResolvedValue(PROPERTY_FIXTURE as any);
  mocks.aiChat.mockResolvedValue({ content: 'Ático luminoso y reformado en pleno centro de Madrid, a dos pasos de la Gran Vía.' });
});

// ─── 1. Intents registrados ─────────────────────────────────────────────────

describe('real-estate-intents', () => {
  it('registra los 6 intents de real estate', () => {
    const names = realEstateIntents.map(i => i.name);
    for (const n of [
      'generar_descripcion_inmueble', 'sugerir_precio_inmueble', 'calificar_inmueble',
      'buscar_inmuebles', 'recomendar_inmuebles', 'calcular_comision_franquicia',
    ]) {
      expect(names).toContain(n);
    }
  });

  it('los intents de propiedad exigen propiedadId; recomendar es read-only', () => {
    const gen = realEstateIntents.find(i => i.name === 'generar_descripcion_inmueble')!;
    const cal = realEstateIntents.find(i => i.name === 'calificar_inmueble')!;
    const com = realEstateIntents.find(i => i.name === 'calcular_comision_franquicia')!;
    expect(gen.requiredParams).toContain('propiedadId');
    expect(cal.requiredParams).toContain('propiedadId');
    expect(com.requiredParams).toContain('propiedadId');
    for (const intent of realEstateIntents) {
      expect(intent.destructive).toBe(false);
    }
  });
});

// ─── 2. Mapping orchestrator: intent → skill ───────────────────────────────

describe('SkillOrchestrator — wiring de real estate', () => {
  const ctx = {
    tenantId: TENANT,
    userId: 'user-1',
    pendingIntent: '',
    collectedEntities: {},
    missingEntities: [],
  };

  it('los 6 intents mapean a sus skills', async () => {
    const cases: Array<[string, Record<string, string>, string]> = [
      ['generar_descripcion_inmueble', { propiedadId: 'prop-1' }, 'generate_property_description'],
      ['sugerir_precio_inmueble', { propiedadId: 'prop-1', tipo_operacion: 'venta' }, 'suggest_price_based_on_market'],
      ['calificar_inmueble', { propiedadId: 'prop-1' }, 'calculate_property_quality_score'],
      ['buscar_inmuebles', { query: 'departamentos en venta en Madrid' }, 'search_properties_by_filters'],
      ['recomendar_inmuebles', { tipo_operacion: 'alquiler', zona: 'Centro' }, 'recommend_properties'],
      ['calcular_comision_franquicia', { propiedadId: 'prop-1' }, 'calculate_franchise_commissions'],
    ];
    for (const [intent, entities, skill] of cases) {
      const result = await SkillOrchestratorAgent.createPlan({ intent, entities, missingEntities: [] }, ctx, TENANT);
      expect(result.plan?.steps[0].action).toBe(skill);
    }
  });

  it('el módulo real estate está disponible en el plan basico (usa catalogo)', async () => {
    mocks.tenantFindUnique.mockResolvedValue({ id: TENANT, plan: 'basico', tenantFeatures: [] } as any);
    const result = await SkillOrchestratorAgent.createPlan(
      { intent: 'calificar_inmueble', entities: { propiedadId: 'prop-1' }, missingEntities: [] },
      ctx,
      TENANT,
    );
    expect(result.plan?.steps[0].action).toBe('calculate_property_quality_score');
  });
});

// ─── 3. Wrappers de skills (mapeo de nombres ES → params del core) ─────────

describe('skills — real estate', () => {
  it('generate_property_description resuelve la propiedad por nombre y llama al core', async () => {
    const result = await (skills as any).generate_property_description({
      tenantId: TENANT,
      propiedad: 'centro',
    });
    expect(mocks.catalogoItemFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ tenantId: TENANT, tipo: 'inmueble' }) }),
    );
    expect(result.description).toContain('Ático luminoso');
  });

  it('generate_property_description sin propiedad lanza error claro', async () => {
    await expect((skills as any).generate_property_description({ tenantId: TENANT })).rejects.toThrow('propiedad');
  });

  it('suggest_price_based_on_market mapea tipo_operacion al resultado', async () => {
    mocks.queryRawUnsafe.mockResolvedValue([
      { precioBase: 300000, area: '100' },
      { precioBase: 360000, area: '120' },
    ]);
    const result = await (skills as any).suggest_price_based_on_market({
      tenantId: TENANT,
      propiedadId: 'prop-1',
      tipo_operacion: 'venta',
    });
    expect(result.suggestedPrice).toBeGreaterThan(0);
    expect(result.operationType).toBe('venta');
    expect(result.sampleSize).toBe(2);
  });

  it('calculate_property_quality_score devuelve score y grado', async () => {
    const result = await (skills as any).calculate_property_quality_score({
      tenantId: TENANT,
      propiedadId: 'prop-1',
    });
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
    expect(['A', 'B', 'C', 'D']).toContain(result.grade);
  });

  it('search_properties_by_filters pasa query construida al core', async () => {
    mocks.queryRawUnsafe.mockResolvedValue([
      { id: 'prop-2', nombre: 'Casa en la playa', precioBase: 400000, customFieldValues: { tipo_operacion: 'venta', zona: 'Playa', tipo_inmueble: 'Casa' }, media: [] },
    ]);
    const result = await (skills as any).search_properties_by_filters({
      tenantId: TENANT,
      tipo_operacion: 'venta',
      tipo_inmueble: 'Casa',
      zona: 'Playa',
    });
    expect(result.total).toBe(1);
    expect(result.properties[0].propertyType).toBe('Casa');
    expect(mocks.queryRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining('CatalogoItem'),
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
    );
  });

  it('recommend_properties mapea zona y presupuesto', async () => {
    mocks.queryRawUnsafe.mockResolvedValue([
      { id: 'prop-3', nombre: 'Piso en el centro', precioBase: 500000, customFieldValues: { tipo_operacion: 'alquiler', zona: 'Centro', tipo_inmueble: 'Departamento' }, media: [], quality_score: '80' },
    ]);
    mocks.aiChat.mockResolvedValue({ content: '1. Ideal para quien busca ubicación céntrica' });
    const result = await (skills as any).recommend_properties({
      tenantId: TENANT,
      tipo_operacion: 'alquiler',
      zona: 'Centro',
      presupuesto: 600000,
    });
    expect(result.total).toBe(1);
    expect(result.recommendations[0].titulo).toContain('centro');
    expect(result.recommendations[0].razon).toContain('Ideal');
  });

  it('calculate_franchise_commissions resuelve propiedad → deal y calcula', async () => {
    mocks.dealFindFirst.mockResolvedValue({ id: 'deal-1', valor: 350000, valorReal: 350000, moneda: 'EUR' } as any);
    mocks.dealFindUnique.mockResolvedValue({ id: 'deal-1', tenantId: TENANT, valor: 350000, valorReal: 350000, moneda: 'EUR' } as any);
    mocks.comisionCreate.mockResolvedValue({ id: 'com-1' } as any);

    const result = await (skills as any).calculate_franchise_commissions({
      tenantId: TENANT,
      propiedad: 'centro',
      userId: 'user-1',
    });
    expect(mocks.dealFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ tenantId: TENANT, catalogoItemId: 'prop-1' }) }),
    );
    expect(result.success).toBe(true);
    expect(result.montoCalculado).toBeGreaterThan(0);
  });

  it('calculate_franchise_commissions sin deal vinculado lanza error', async () => {
    mocks.dealFindFirst.mockResolvedValue(null);
    await expect((skills as any).calculate_franchise_commissions({
      tenantId: TENANT,
      propiedadId: 'prop-1',
    })).rejects.toThrow('deal');
  });
});

// ─── 4. Formateadores del ExecutionEngine ───────────────────────────────────

describe('ExecutionEngine.formatSkillResult — real estate', () => {
  it('generate_property_description muestra la descripción', () => {
    const msg = ExecutionEngine.formatSkillResult('generate_property_description', {
      description: 'Ático luminoso en el centro de Madrid',
    });
    const plain = msg.replace(/\\/g, '');
    expect(plain).toContain('Descripción generada');
    expect(plain).toContain('Ático luminoso');
  });

  it('suggest_price_based_on_market muestra precio y confianza', () => {
    const msg = ExecutionEngine.formatSkillResult('suggest_price_based_on_market', {
      suggestedPrice: 350000,
      confidence: 'high',
      sampleSize: 12,
      operationType: 'venta',
    });
    const plain = msg.replace(/\\/g, '');
    expect(plain).toContain('Precio sugerido');
    expect(plain).toContain('350');
    expect(plain).toContain('alta');
  });

  it('calculate_property_quality_score muestra score y detalles', () => {
    const msg = ExecutionEngine.formatSkillResult('calculate_property_quality_score', {
      score: 78,
      grade: 'B',
      details: { 'Campos obligatorios': 25 },
    });
    const plain = msg.replace(/\\/g, '');
    expect(plain).toContain('Score de calidad');
    expect(plain).toContain('78');
    expect(plain).toContain('Grado B');
    expect(plain).toContain('Campos obligatorios');
  });

  it('search_properties_by_filters lista las propiedades', () => {
    const msg = ExecutionEngine.formatSkillResult('search_properties_by_filters', {
      properties: [{ nombre: 'Ático en el centro', operationType: 'venta', precioBase: 350000, city: 'Madrid', bedrooms: 3 }],
      total: 1,
    });
    const plain = msg.replace(/\\/g, '');
    expect(plain).toContain('Propiedades (1)');
    expect(plain).toContain('Ático en el centro');
    expect(plain).toContain('Madrid');
  });

  it('recommend_properties muestra razones de recomendación', () => {
    const msg = ExecutionEngine.formatSkillResult('recommend_properties', {
      recommendations: [{ titulo: 'Piso en el centro', precioFormateado: '500.000 €', ubicacion: 'Centro, Madrid', razon: 'Buena relación calidad-precio' }],
    });
    const plain = msg.replace(/\\/g, '');
    expect(plain).toContain('Recomendaciones');
    expect(plain).toContain('Piso en el centro');
    expect(plain).toContain('calidad-precio');
  });

  it('calculate_franchise_commissions muestra monto y desglose', () => {
    const msg = ExecutionEngine.formatSkillResult('calculate_franchise_commissions', {
      success: true,
      montoCalculado: 10500,
      desglose: ['Agente: 70% (7.350 €)', 'Agencia: 30% (3.150 €)'],
    });
    const plain = msg.replace(/\\/g, '');
    expect(plain).toContain('Comisión calculada');
    expect(plain).toContain('10.500');
    expect(plain).toContain('Agente');
  });
});
