// @vitest-environment node

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  dealFindFirst: vi.fn(),
  dealFindMany: vi.fn(),
  contactFindFirst: vi.fn(),
  catalogoItemFindFirst: vi.fn(),
  catalogoItemFindMany: vi.fn(),
  catalogoFieldDefinitionFindMany: vi.fn(),
  leadFindFirst: vi.fn(),
  leadFindUnique: vi.fn(),
  leadFindMany: vi.fn(),
  tenantFindUnique: vi.fn(),
  subscriptionPlanFindUnique: vi.fn(),
  userFindFirst: vi.fn(),
  pageCreate: vi.fn(),
  trainingSessionFindFirst: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    deal: { findFirst: mocks.dealFindFirst, findMany: mocks.dealFindMany },
    contact: { findFirst: mocks.contactFindFirst },
    catalogoItem: { findFirst: mocks.catalogoItemFindFirst, findMany: mocks.catalogoItemFindMany },
    catalogoFieldDefinition: { findMany: mocks.catalogoFieldDefinitionFindMany },
    lead: { findFirst: mocks.leadFindFirst, findUnique: mocks.leadFindUnique, findMany: mocks.leadFindMany },
    tenant: { findUnique: mocks.tenantFindUnique },
    subscriptionPlan: { findUnique: mocks.subscriptionPlanFindUnique },
    user: { findFirst: mocks.userFindFirst },
    page: { create: mocks.pageCreate },
    trainingSession: { findFirst: mocks.trainingSessionFindFirst },
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

vi.mock('@/lib/ai/gemma-client', () => ({
  callGemma: vi.fn().mockResolvedValue({
    content: JSON.stringify({
      customerResponse: 'Hola, me interesa saber más sobre su propuesta.',
      objectionType: 'general',
      sentiment: 'neutral',
    }),
  }),
}));

vi.mock('@/lib/skills/notification-layer', () => ({
  notifyUser: vi.fn(),
}));

vi.mock('@/lib/services/push-notification', () => ({
  broadcastPushNotification: vi.fn(),
}));

const { advancedConsultIntents } = await import('@/lib/agents/intents/web-creator-training-intents');
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

  mocks.leadFindFirst.mockResolvedValue({
    id: 'lead-1',
    tenantId: TENANT,
    nombre: 'María García',
    email: 'maria@empresa.com',
    telefono: '+5215500000000',
    empresa: 'Empresa SA',
  } as any);
  mocks.leadFindMany.mockResolvedValue([{ id: 'lead-1', nombre: 'María García' }] as any);

  mocks.contactFindFirst.mockResolvedValue({
    id: 'contact-1',
    tenantId: TENANT,
    nombre: 'Laura Gómez',
    email: 'laura@empresa.com',
    telefono: '+5215500000001',
    cargo: 'Directora',
  } as any);

  mocks.dealFindFirst.mockResolvedValue({
    id: 'deal-1',
    tenantId: TENANT,
    leadId: 'lead-1',
    titulo: 'Negocio - María García',
    valor: 5000,
    etapa: 'Negociación',
    prioridad: 'alta',
    lead: { id: 'lead-1', nombre: 'María García', email: 'maria@empresa.com' },
    cotizaciones: [],
  } as any);
  mocks.dealFindMany.mockResolvedValue([{ id: 'deal-1', titulo: 'Negocio - María García' }] as any);

  mocks.catalogoItemFindFirst.mockResolvedValue({
    id: 'item-1',
    tenantId: TENANT,
    nombre: 'Cafetera Pro',
    precio: 299,
    tasaImpuesto: { nombre: 'IVA', porcentaje: 21 },
  } as any);
  mocks.catalogoItemFindMany.mockResolvedValue([{ id: 'item-1', nombre: 'Cafetera Pro' }] as any);
  mocks.catalogoFieldDefinitionFindMany.mockResolvedValue([] as any);
  mocks.leadFindUnique.mockResolvedValue({
    id: 'lead-1',
    tenantId: TENANT,
    nombre: 'María García',
    email: 'maria@empresa.com',
    telefono: '+5215500000000',
    notasTimestamp: [],
    interacciones: [],
  } as any);
  mocks.trainingSessionFindFirst.mockResolvedValue({ id: 'ts-1', score: 50 } as any);

  mocks.pageCreate.mockResolvedValue({
    id: 'page-1',
    slug: 'landing-maria',
    url: '/creador/editor/page-1',
  } as any);
});

describe('IntentClassifier — bloque 23 (consultas avanzadas, Web Creator y Training)', () => {
  const classifier = makeClassifier();
  const base = { message: '', userId: 'user-1', tenantId: TENANT };

  it('detecta detalles de negocio por nombre', async () => {
    const r = await classifier.classify({ ...base, message: 'dame los detalles del negocio de María García' });
    expect(r.intent).toBe('detalles_negocio');
    expect(r.extractedParams.nombre).toBeTruthy();
  });

  it('detecta detalles de negocio por email', async () => {
    const r = await classifier.classify({ ...base, message: 'cómo va la venta con maria@empresa.com' });
    expect(r.intent).toBe('detalles_negocio');
    expect(r.extractedParams.email).toContain('@');
  });

  it('detecta detalles de contacto por nombre', async () => {
    const r = await classifier.classify({ ...base, message: 'dame los detalles del contacto Laura Gómez' });
    expect(r.intent).toBe('detalles_contacto');
    expect(r.extractedParams.nombre).toBeTruthy();
  });

  it('detecta detalles de producto por nombre', async () => {
    const r = await classifier.classify({ ...base, message: 'dame los detalles del producto Cafetera Pro' });
    expect(r.intent).toBe('detalles_producto');
    expect(r.extractedParams.nombre).toBeTruthy();
  });

  it('detecta exportar catálogo en CSV', async () => {
    const r = await classifier.classify({ ...base, message: 'exporta el catálogo en CSV' });
    expect(r.intent).toBe('exportar_catalogo');
    expect(r.extractedParams.formato).toBe('csv');
  });

  it('detecta sugerir respuesta para un lead', async () => {
    const r = await classifier.classify({ ...base, message: 'sugiere una respuesta para el lead María García' });
    expect(r.intent).toBe('sugerir_respuesta');
    expect(r.extractedParams.nombre).toBeTruthy();
  });

  it('detecta generar landing para un lead', async () => {
    const r = await classifier.classify({ ...base, message: 'genera una landing para el lead María García' });
    expect(r.intent).toBe('generar_landing');
    expect(r.extractedParams.nombre).toBeTruthy();
  });

  it('NO colisiona: "busca el contacto Laura Gómez" sigue siendo listar_contactos', async () => {
    const r = await classifier.classify({ ...base, message: 'busca el contacto Laura Gómez' });
    expect(r.intent).toBe('listar_contactos');
  });

  it('NO colisiona: "actualiza el contacto de Alejandra" sigue siendo actualizar_lead', async () => {
    const r = await classifier.classify({ ...base, message: 'actualiza el teléfono del contacto Alejandra a 555-1234' });
    expect(r.intent).toBe('actualizar_lead');
  });

  it('NO colisiona: "enviar un email a María" sigue siendo enviar_mensaje', async () => {
    const r = await classifier.classify({ ...base, message: 'envía un email a maria@empresa.com para agradecer la reunión' });
    expect(r.intent).toBe('enviar_mensaje');
  });

  it('NO colisiona: "muéstrame mis negocios" sigue siendo mis_negocios', async () => {
    const r = await classifier.classify({ ...base, message: 'muéstrame mis negocios' });
    expect(r.intent).toBe('mis_negocios');
  });

  it('los 6 intents de consultas avanzadas están declarados en el schema', () => {
    const names = advancedConsultIntents.map((i) => i.name);
    expect(names).toEqual(
      expect.arrayContaining([
        'detalles_negocio',
        'detalles_contacto',
        'detalles_producto',
        'exportar_catalogo',
        'sugerir_respuesta',
        'generar_landing',
      ]),
    );
  });
});

describe('skills registry — bloque 23', () => {
  it('los 6 skills están registrados', () => {
    for (const name of [
      'get_deal_details',
      'get_contact_details',
      'get_catalog_item_details',
      'export_catalog_chat',
      'suggest_customer_response',
      'generate_landing_draft_chat',
    ] as (keyof typeof skills)[]) {
      expect(typeof skills[name]).toBe('function');
    }
  });
});

describe('SkillOrchestrator — wiring del bloque 23', () => {
  const ctx = {
    tenantId: TENANT,
    userId: 'user-1',
    pendingIntent: '',
    collectedEntities: {},
    missingEntities: [],
  };

  it('los 6 intents mapean a sus skills', async () => {
    const cases: Array<[string, Record<string, string>, string]> = [
      ['detalles_negocio', { nombre: 'María García' }, 'get_deal_details'],
      ['detalles_contacto', { nombre: 'Laura Gómez' }, 'get_contact_details'],
      ['detalles_producto', { nombre: 'Cafetera Pro' }, 'get_catalog_item_details'],
      ['exportar_catalogo', { formato: 'csv' }, 'export_catalog_chat'],
      ['sugerir_respuesta', { nombre: 'María García' }, 'suggest_customer_response'],
      ['generar_landing', { nombre: 'María García' }, 'generate_landing_draft_chat'],
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

  it('detalles_producto mapea al módulo catálogo (incluido en plan básico → plan directo)', async () => {
    mocks.tenantFindUnique.mockResolvedValue({ id: TENANT, plan: 'basico', tenantFeatures: [] } as any);
    const result = await (SkillOrchestratorAgent as any).createPlan(
      { intent: 'detalles_producto', entities: { nombre: 'Cafetera Pro' }, missingEntities: [] },
      ctx,
      TENANT,
    );
    expect(result.plan?.steps[0].action).toBe('get_catalog_item_details');
  });

  it('generar_landing respeta el módulo cms (plan básico → sin acceso)', async () => {
    mocks.tenantFindUnique.mockResolvedValue({ id: TENANT, plan: 'basico', tenantFeatures: [] } as any);
    const result = await (SkillOrchestratorAgent as any).createPlan(
      { intent: 'generar_landing', entities: { nombre: 'María García' }, missingEntities: [] },
      ctx,
      TENANT,
    );
    expect(result.response).toContain('Web Creator');
  });
});

describe('wrappers del bloque 23', () => {
  it('get_deal_details resuelve el negocio por nombre y devuelve la ficha', async () => {
    const result = await (skills as any).get_deal_details({
      tenantId: TENANT,
      nombre: 'María García',
    });
    expect(result).toBeTruthy();
    expect(mocks.leadFindFirst).toHaveBeenCalled();
    expect(mocks.dealFindFirst).toHaveBeenCalled();
    expect(result.lead?.nombre).toBe('María García');
  });

  it('get_contact_details resuelve el contacto por email', async () => {
    const result = await (skills as any).get_contact_details({
      tenantId: TENANT,
      email: 'laura@empresa.com',
    });
    expect(result).toBeTruthy();
    expect(mocks.contactFindFirst).toHaveBeenCalled();
    expect(result.email).toBe('laura@empresa.com');
  });

  it('get_catalog_item_details resuelve el producto por nombre', async () => {
    const result = await (skills as any).get_catalog_item_details({
      tenantId: TENANT,
      nombre: 'Cafetera Pro',
    });
    expect(result).toBeTruthy();
    expect(mocks.catalogoItemFindFirst).toHaveBeenCalled();
    expect(result.item?.nombre).toBe('Cafetera Pro');
  });

  it('export_catalog_chat exporta y devuelve un resumen con formato', async () => {
    const result = await (skills as any).export_catalog_chat({
      tenantId: TENANT,
      formato: 'csv',
    });
    expect(result).toBeTruthy();
    expect(mocks.catalogoItemFindMany).toHaveBeenCalled();
    expect(String(result.summary)).toContain('CSV');
  });

  it('suggest_customer_response resuelve el lead y simula la respuesta', async () => {
    const result = await (skills as any).suggest_customer_response({
      tenantId: TENANT,
      nombre: 'María García',
    });
    expect(result).toBeTruthy();
    expect(mocks.leadFindFirst).toHaveBeenCalled();
    expect(result.customerResponse).toBeTruthy();
  });

  it('generate_landing_draft_chat resuelve el lead y crea la página draft', async () => {
    const result = await (skills as any).generate_landing_draft_chat({
      tenantId: TENANT,
      nombre: 'María García',
    });
    expect(result).toBeTruthy();
    expect(mocks.leadFindFirst).toHaveBeenCalled();
    expect(mocks.pageCreate).toHaveBeenCalled();
    expect(result.summary).toContain('Web Creator');
  });
});
