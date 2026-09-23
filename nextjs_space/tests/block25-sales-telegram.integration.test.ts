// @vitest-environment node
//
// Integración del flujo que usa Telegram:
// mensaje → clasificador determinista → orquestador → ExecutionEngine →
// texto que el webhook envía al chat.
//
// Las skills de persistencia se sustituyen por dobles controlados; el
// clasificador, el orquestador, el motor de ejecución y el formateador de
// respuestas son los reales.

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  chatbotConfigFindUnique: vi.fn(),
  chatbotConfigCreate: vi.fn(),
  chatbotConfigUpdate: vi.fn(),
  tenantFindUnique: vi.fn(),
  subscriptionPlanFindUnique: vi.fn(),
  servicioFindMany: vi.fn(),
  conversationFindFirst: vi.fn(),
  conversationFindUnique: vi.fn(),
  conversationUpdate: vi.fn(),
  messageFindMany: vi.fn(),
  messageCreate: vi.fn(),
  userFindUnique: vi.fn(),
  userFindFirst: vi.fn(),
  leadFindFirst: vi.fn(),
  contactFindFirst: vi.fn(),
  chatbotAuditLogCreate: vi.fn(),
  chatbotAuditLogFindMany: vi.fn(),
  chatbotAuditLogCount: vi.fn(),
  createDeal: vi.fn(),
  updateDeal: vi.fn(),
  listDeals: vi.fn(),
  prequalifyLead: vi.fn(),
  dealFindFirst: vi.fn(),
  noteCreate: vi.fn(),
  catalogoItemFindMany: vi.fn(),
}));

const state = {
  hubMetadata: {
    chatbotContext: { collectedEntities: {}, missingEntities: [], facts: [] },
  },
};

vi.mock('@/lib/db', () => ({
  prisma: {
    chatbotConfig: {
      findUnique: mocks.chatbotConfigFindUnique,
      create: mocks.chatbotConfigCreate,
      update: mocks.chatbotConfigUpdate,
    },
    tenant: { findUnique: mocks.tenantFindUnique },
    subscriptionPlan: { findUnique: mocks.subscriptionPlanFindUnique },
    servicio: { findMany: mocks.servicioFindMany },
    conversation: {
      findFirst: mocks.conversationFindFirst,
      findUnique: mocks.conversationFindUnique,
      update: mocks.conversationUpdate,
    },
    message: { findMany: mocks.messageFindMany, create: mocks.messageCreate },
    user: { findUnique: mocks.userFindUnique, findFirst: mocks.userFindFirst },
    lead: { findFirst: mocks.leadFindFirst },
    contact: { findFirst: mocks.contactFindFirst },
    deal: { findFirst: mocks.dealFindFirst },
    note: { create: mocks.noteCreate },
    catalogoItem: { findMany: mocks.catalogoItemFindMany },
    chatbotAuditLog: {
      create: mocks.chatbotAuditLogCreate,
      findMany: mocks.chatbotAuditLogFindMany,
      count: mocks.chatbotAuditLogCount,
    },
  },
}));

// Solo se sustituyen las tres operaciones de persistencia; el ExecutionEngine
// real importa este registry y devuelve el texto formateado para Telegram.
vi.mock('@/lib/skills', () => ({
  skills: {
    create_deal: mocks.createDeal,
    update_deal: mocks.updateDeal,
    list_deals: mocks.listDeals,
    prequalify_lead: mocks.prequalifyLead,
  },
}));

vi.mock('@/lib/agents/fact-extractor', () => ({
  extractFacts: vi.fn(async () => []),
  formatFacts: (facts: any[]) => facts.map((fact: any) => String(fact)),
}));
vi.mock('@/lib/chat/conversation-summarizer', () => ({
  needsSummarization: vi.fn(() => false),
  generateSummary: vi.fn(async () => ({ text: '', topics: [], decisions: [], customerInfo: {}, timestamp: 0, summarizedMessages: 0, version: 2 })),
  buildSummaryBlock: vi.fn(() => ''),
}));
vi.mock('@/lib/chat/conversation-analyzer', () => ({
  analyzeConversation: vi.fn(async () => ({ resolved: false, sentiment: 'neutral' })),
}));
vi.mock('@/lib/chat/pattern-detector', () => ({ detectPatterns: vi.fn(async () => []) }));
vi.mock('@/lib/chat/improvement-engine', () => ({ generateSuggestions: vi.fn(async () => undefined) }));
vi.mock('@/lib/knowledge/knowledge-service', () => ({
  KnowledgeService: {
    searchSemantic: vi.fn(async () => []),
    searchCatalogItems: vi.fn(async () => []),
  },
}));

const { processMessage } = await import('@/lib/chat/chatbot-service');

const TENANT = 'tenant-block25';
const CONVERSATION = 'telegram-block25';

beforeEach(() => {
  vi.clearAllMocks();
  state.hubMetadata = {
    chatbotContext: { collectedEntities: {}, missingEntities: [], facts: [] },
  };

  mocks.chatbotConfigFindUnique.mockResolvedValue({
    tenantId: TENANT,
    activo: true,
    diasActivos: '1,2,3,4,5,6,7',
    horarioInicio: 0,
    horarioFin: 23,
    ragActivo: false,
  });
  mocks.chatbotConfigUpdate.mockResolvedValue({});
  mocks.tenantFindUnique.mockResolvedValue({
    id: TENANT,
    nombre: 'Volkern',
    plan: 'empresarial',
    tenantFeatures: [],
  });
  mocks.subscriptionPlanFindUnique.mockResolvedValue({
    slug: 'empresarial',
    nombre: 'Empresarial',
    precio: 0,
    moneda: 'EUR',
    intervalo: 'mensual',
    limiteUsuarios: -1,
    limiteLeads: -1,
    limiteStorage: -1,
    limiteCursos: -1,
    limiteEstudiantes: -1,
    features: { modules: ['pipeline'] },
    whitelabelHabilitado: false,
    dominioPersonalizadoHabilitado: false,
  });
  mocks.servicioFindMany.mockResolvedValue([]);
  mocks.conversationFindFirst.mockResolvedValue({ id: CONVERSATION });
  mocks.conversationFindUnique.mockImplementation(async () => state);
  mocks.conversationUpdate.mockImplementation(async ({ data }: any) => {
    if (data.hubMetadata !== undefined) state.hubMetadata = data.hubMetadata;
    return { id: CONVERSATION };
  });
  mocks.messageFindMany.mockResolvedValue([]);
  mocks.messageCreate.mockResolvedValue({ id: 'message-block25' });
  mocks.userFindUnique.mockResolvedValue(null);
  mocks.userFindFirst.mockResolvedValue({ name: 'Bruno Hess', bookingEnabled: true, bookingSlug: 'bruno-hess' });
  mocks.leadFindFirst.mockResolvedValue(null);
  mocks.contactFindFirst.mockResolvedValue(null);
  mocks.dealFindFirst.mockResolvedValue(null);
  mocks.prequalifyLead.mockResolvedValue({
    success: true,
    noteId: 'note-1',
    dealUpdated: false,
    catalogMatches: [],
    summary: 'Nota registrada.',
  });
  mocks.noteCreate.mockResolvedValue({ id: 'note-1' });
  mocks.catalogoItemFindMany.mockResolvedValue([]);
  mocks.chatbotAuditLogCreate.mockResolvedValue({ id: 'audit-block25' });
  mocks.chatbotAuditLogFindMany.mockResolvedValue([]);
  mocks.chatbotAuditLogCount.mockResolvedValue(0);
});

describe('Bloque 25 — respuestas de ventas que recibe Telegram', () => {
  it('crear negocio: devuelve título, importe, moneda y etapa en la respuesta', async () => {
    mocks.createDeal.mockResolvedValue({
      id: 'deal-1',
      titulo: 'Implementación ERP',
      valor: 12500,
      moneda: 'EUR',
      etapa: 'calificacion',
    });

    const result = await processMessage({
      tenantId: TENANT,
      conversationId: `${CONVERSATION}-crear`,
      channel: 'telegram',
      userId: 'telegram:646107192',
      message: 'crea un deal con ana@empresa.test por 12500€ para implementación ERP',
    });

    expect(result.success).toBe(true);
    expect(result.response).toContain('Negocio creado');
    expect(result.response).toContain('Implementación ERP');
    // El importe se escribe en la divisa del negocio y con su símbolo, no con la
    // cifra pelada y el código ISO al lado.
    expect(result.response.replace(/\\/g, '')).toContain('12.500,00');
    // El símbolo va tras un espacio duro, así que se comprueba aparte.
    expect(result.response).toContain('€');
    expect(result.response).not.toContain('12500');
    expect(result.response).not.toContain('EUR');
    expect(result.response).toContain('calificacion');
    expect(mocks.createDeal).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: TENANT,
      email: 'ana@empresa.test',
      monto: 12500,
      titulo: expect.stringContaining('implementación ERP'),
    }));
  });

  it('actualizar negocio: devuelve la etapa, el importe y la prioridad actualizados', async () => {
    mocks.updateDeal.mockResolvedValue({
      id: 'deal-1',
      titulo: 'Negocio - Ana',
      etapa: 'negociacion',
      valor: 15000,
      moneda: 'EUR',
      prioridad: 'alta',
    });

    const result = await processMessage({
      tenantId: TENANT,
      conversationId: `${CONVERSATION}-actualizar`,
      channel: 'telegram',
      userId: 'telegram:646107192',
      message: 'actualiza el deal de ana@empresa.test a etapa negociación y prioridad alta',
    });

    expect(result.success).toBe(true);
    expect(result.response).toContain('Negocio actualizado');
    expect(result.response).toContain('negociacion');
    expect(result.response.replace(/\\/g, '')).toContain('15.000,00');
    expect(result.response).toContain('€');
    expect(result.response).not.toContain('15000');
    expect(result.response).toContain('alta');
    expect(mocks.updateDeal).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: TENANT,
      email: 'ana@empresa.test',
      etapa: 'negociación',
      prioridad: 'alta',
    }));
  });

  it('calificar lead: devuelve confirmación con la nota (la regresión del note.create está en telegram-user-resolve)', async () => {
    // El lead real debe resolverse por email para precalificar.
    mocks.leadFindFirst.mockImplementation(async ({ where }: any) => {
      if (where?.email) return { id: 'lead-jose', nombre: 'José Acevedo' };
      return null;
    });
    mocks.prequalifyLead.mockResolvedValue({
      success: true,
      noteId: 'note-1',
      dealUpdated: false,
      catalogMatches: [],
      summary: 'Nota registrada.',
    });

    const result = await processMessage({
      tenantId: TENANT,
      conversationId: `${CONVERSATION}-calificar`,
      channel: 'telegram',
      userId: 'telegram:646107192',
      message: 'precalifica a jose.acevedo@acevedoseguros.com.mx: interesado en el paquete premium',
    });

    expect(result.success).toBe(true);
    expect(result.response).toContain('precalificado');
    expect(mocks.prequalifyLead).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: TENANT,
      email: 'jose.acevedo@acevedoseguros.com.mx',
      nota: 'interesado en el paquete premium',
    }));
  });

  it('listar negocios: devuelve total, título, lead, importe y etapa de cada deal', async () => {
    mocks.listDeals.mockResolvedValue({
      deals: [
        {
          id: 'deal-1',
          titulo: 'Consultoría ERP',
          valor: 3000,
          moneda: 'EUR',
          etapa: 'propuesta',
          lead: { nombre: 'Ana López' },
        },
        {
          id: 'deal-2',
          titulo: 'Licencias Volkern',
          valor: 1200,
          moneda: 'EUR',
          etapa: 'calificacion',
          lead: { nombre: 'Carlos Ruiz' },
        },
      ],
      total: 2,
      page: 1,
      limit: 50,
    });

    const result = await processMessage({
      tenantId: TENANT,
      conversationId: `${CONVERSATION}-listar`,
      channel: 'telegram',
      userId: 'telegram:646107192',
      message: 'muéstrame los negocios en etapa propuesta',
    });

    expect(result.success).toBe(true);
    expect(result.response).toContain('Pipeline (2)');
    expect(result.response).toContain('Consultoría ERP');
    expect(result.response).toContain('Ana López');
    expect(result.response).toContain('3000');
    expect(result.response).toContain('propuesta');
    expect(result.response).toContain('Licencias Volkern');
    expect(result.response).toContain('Carlos Ruiz');
    expect(mocks.listDeals).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: TENANT,
      etapa: 'propuesta',
    }));
  });
});
