// @vitest-environment node
//
// Test de integración anti-regresión: dos turnos seguidos del chatbot sobre la
// MISMA conversación. Reproduce el bug real donde `updateContext` fusionaba
// collectedEntities y la "limpieza" (collectedEntities: {}) no borraba nada →
// el email/nombre de un turno anterior se filtraba al siguiente y el correo se
// enviaba al destinatario equivocado (ej. "envía email a Roberta" enviaba a
// Alejandra).
//
// Turno 1: "envía un email a Alejandra Velázquez" (Alejandra SÍ está en el CRM)
//   → se ejecuta el skill y el contexto queda LIMPIO.
// Turno 2: "envía un email a Roberta Test Inexistente" (NO está en el CRM)
//   → debe pedir confirmación de registro y NO filtrar el email de Alejandra.

import { describe, it, expect, vi, beforeEach } from 'vitest';

const TENANT = 'tenant-1';
const CONV = 'conv-1';

const mocks = vi.hoisted(() => ({
  chatbotConfigFindUnique: vi.fn(),
  chatbotConfigCreate: vi.fn(),
  chatbotConfigUpdate: vi.fn(),
  tenantFindUnique: vi.fn(),
  servicioFindMany: vi.fn(),
  conversationFindFirst: vi.fn(),
  conversationFindUnique: vi.fn(),
  conversationUpdate: vi.fn(),
  messageFindMany: vi.fn(),
  messageCreate: vi.fn(),
  leadFindFirst: vi.fn(),
  contactFindFirst: vi.fn(),
  userFindUnique: vi.fn(),
  userFindFirst: vi.fn(),
  classify: vi.fn(),
  isDestructive: vi.fn(),
  createPlan: vi.fn(),
  run: vi.fn(),
  extractFacts: vi.fn(),
  needsSummarization: vi.fn(),
}));

// "Almacén" de la conversación: el hubMetadata que persiste entre turnos.
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
    servicio: { findMany: mocks.servicioFindMany },
    conversation: {
      findFirst: mocks.conversationFindFirst,
      findUnique: mocks.conversationFindUnique,
      update: mocks.conversationUpdate,
    },
    message: { findMany: mocks.messageFindMany, create: mocks.messageCreate },
    lead: { findFirst: mocks.leadFindFirst },
    contact: { findFirst: mocks.contactFindFirst },
    user: { findUnique: mocks.userFindUnique, findFirst: mocks.userFindFirst },
    chatbotAuditLog: {
      findMany: vi.fn(async () => []),
      count: vi.fn(async () => 0),
      create: vi.fn(async () => ({})),
    },
  },
}));

vi.mock('@/lib/agents/intent-classifier', () => ({
  intentClassifier: {
    classify: (...args: any[]) => mocks.classify(...args),
    isDestructive: (...args: any[]) => mocks.isDestructive(...args),
  },
}));

vi.mock('@/lib/agents/skill-orchestrator', () => ({
  SkillOrchestratorAgent: {
    createPlan: (...args: any[]) => mocks.createPlan(...args),
  },
}));

vi.mock('@/lib/agents/execution-engine', () => ({
  ExecutionEngine: {
    run: (...args: any[]) => mocks.run(...args),
  },
}));

vi.mock('@/lib/agents/fact-extractor', () => ({
  extractFacts: (...args: any[]) => mocks.extractFacts(...args),
  formatFacts: (facts: any[]) => (facts || []).map((f: any) => String(f)),
}));

vi.mock('@/lib/chat/conversation-summarizer', () => ({
  needsSummarization: (...args: any[]) => mocks.needsSummarization(...args),
  generateSummary: vi.fn(async () => ({
    text: '', topics: [], decisions: [], customerInfo: {}, timestamp: 0, summarizedMessages: 0, version: 2,
  })),
  buildSummaryBlock: vi.fn(() => ''),
}));

vi.mock('@/lib/chat/conversation-analyzer', () => ({
  analyzeConversation: vi.fn(async () => ({ resolved: false, sentiment: 'neutral' })),
}));

vi.mock('@/lib/chat/pattern-detector', () => ({
  detectPatterns: vi.fn(async () => []),
}));

vi.mock('@/lib/chat/improvement-engine', () => ({
  generateSuggestions: vi.fn(async () => {}),
}));

vi.mock('@/lib/knowledge/knowledge-service', () => ({
  KnowledgeService: {
    searchSemantic: vi.fn(async () => []),
    searchCatalogItems: vi.fn(async () => []),
  },
}));

const { processMessage } = await import('@/lib/chat/chatbot-service');

function classification(nombre: string, mensaje = 'Gracias por la reunión') {
  return {
    intent: 'enviar_mensaje',
    confidence: 0.95,
    needsMoreInfo: false,
    missingParams: [],
    extractedParams: { mensaje, nombre },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // Conversación limpia al empezar
  state.hubMetadata = {
    chatbotContext: { collectedEntities: {}, missingEntities: [], facts: [] },
  };

  mocks.chatbotConfigFindUnique.mockResolvedValue({
    tenantId: TENANT,
    activo: true,
    diasActivos: '1,2,3,4,5',
    horarioInicio: 0,
    horarioFin: 23,
    ragActivo: false,
  });
  mocks.chatbotConfigUpdate.mockResolvedValue({});
  mocks.tenantFindUnique.mockResolvedValue({ id: TENANT, nombre: 'Dimension Expert', plan: 'pro' });
  mocks.servicioFindMany.mockResolvedValue([]);
  mocks.conversationFindFirst.mockResolvedValue({ id: CONV });
  mocks.conversationFindUnique.mockImplementation(async () => state);
  mocks.conversationUpdate.mockImplementation(async ({ data }: any) => {
    // addMessage también hace update (solo ultimoMensaje/fecha) — no tocar el contexto ahí
    if (data.hubMetadata !== undefined) {
      state.hubMetadata = data.hubMetadata;
    }
    return { id: CONV };
  });
  mocks.messageFindMany.mockResolvedValue([]);
  mocks.messageCreate.mockResolvedValue({ id: 'msg-1' });
  mocks.userFindUnique.mockResolvedValue(null);
  mocks.userFindFirst.mockResolvedValue({
    name: 'Bruno Hess',
    bookingEnabled: true,
    bookingSlug: 'bruno-hess',
    bookingTitle: 'Asesor',
  });
  mocks.isDestructive.mockReturnValue(false);
  mocks.extractFacts.mockResolvedValue([]);
  mocks.needsSummarization.mockReturnValue(false);
  mocks.run.mockResolvedValue({ message: '✅ Email enviado a Alejandra (alev@x.com)', data: null });

  // Martes 18/08/2026 15:00 UTC — dentro de horario laboral
  vi.setSystemTime(new Date('2026-08-18T15:00:00Z'));
});

describe('dos turnos seguidos — sin fuga de collectedEntities', () => {
  it('turno 1 (contacto en CRM) ejecuta y limpia el contexto; turno 2 (contacto nuevo) pide confirmación sin filtrar datos', async () => {
    // ─── Turno 1: Alejandra SÍ está en el CRM ───
    mocks.leadFindFirst.mockResolvedValue({
      id: 'lead-ale',
      nombre: 'Alejandra Velázquez',
      email: 'alevvalverde@gmail.com',
    });
    mocks.classify.mockResolvedValue(classification('Alejandra Velázquez'));
    mocks.createPlan.mockResolvedValue({
      success: true,
      plan: { steps: [{ action: 'send_message', params: { tenantId: TENANT, nombre: 'Alejandra Velázquez' } }] },
    });

    const turn1 = await processMessage({
      tenantId: TENANT,
      message: 'envía un email a Alejandra Velázquez',
      channel: 'telegram',
    });

    expect(turn1.success).toBe(true);
    expect(mocks.run).toHaveBeenCalledTimes(1); // el skill se ejecutó

    // El contexto quedó LIMPIO tras el turno 1 (la fuga venía de aquí)
    expect(state.hubMetadata.chatbotContext.collectedEntities).toEqual({});
    expect(state.hubMetadata.chatbotContext.pendingIntent).toBeUndefined();
    expect(state.hubMetadata.chatbotContext.missingEntities).toEqual([]);

    // ─── Turno 2: Roberta NO está en el CRM ───
    mocks.leadFindFirst.mockResolvedValue(null);
    mocks.contactFindFirst.mockResolvedValue(null);
    mocks.classify.mockResolvedValue(classification('Roberta Test Inexistente'));

    const turn2 = await processMessage({
      tenantId: TENANT,
      message: 'envía un email a Roberta Test Inexistente',
      channel: 'telegram',
    });

    expect(turn2.success).toBe(true);
    expect(turn2.response).toContain('no está registrado'); // pide confirmación de registro
    expect(mocks.run).toHaveBeenCalledTimes(1); // NO se ejecutó ningún skill en el turno 2

    // El estado pendiente es SOLO de Roberta: no hay rastro del email de Alejandra
    expect(state.hubMetadata.chatbotContext.collectedEntities.email).toBeUndefined();
    expect(state.hubMetadata.chatbotContext.collectedEntities.nombre).toBe('Roberta Test Inexistente');
    expect(state.hubMetadata.chatbotContext.pendingIntent).toBe('enviar_mensaje');
    expect(state.hubMetadata.chatbotContext.missingEntities).toContain('confirmar_registro');
  });

  it('un turno aislado con contacto nuevo también pide confirmación (sin estado previo)', async () => {
    mocks.leadFindFirst.mockResolvedValue(null);
    mocks.contactFindFirst.mockResolvedValue(null);
    mocks.classify.mockResolvedValue(classification('Roberta Test Inexistente'));

    const result = await processMessage({
      tenantId: TENANT,
      message: 'envía un email a Roberta Test Inexistente',
      channel: 'telegram',
    });

    expect(result.success).toBe(true);
    expect(result.response).toContain('no está registrado');
    expect(mocks.run).not.toHaveBeenCalled();
    expect(state.hubMetadata.chatbotContext.collectedEntities.email).toBeUndefined();
  });
});
