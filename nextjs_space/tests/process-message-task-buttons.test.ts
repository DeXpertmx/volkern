// @vitest-environment node
//
// Test de integración anti-regresión: `processMessage` (chatbot-service) debe
// devolver `taskButtons` para los intents de listado de tareas
// (mis_tareas / tareas_vencidas / tareas_hoy) cuando el skill devuelve un
// array de tareas. Cada entrada `{ taskId, titulo }` es la que el webhook de
// Telegram (route.ts) convierte en una fila de 3 botones inline:
//   ✅ Completar  → task:complete:<id>
//   📅 Reprogramar → task:resched:<id>
//   ⏰ Recordar más tarde → task:snooze:<id>
//
// Casos cubiertos:
//   1. mis_tareas + data array → taskButtons con una entrada por tarea.
//   2. Cada entrada genera una fila de exactamente 3 botones con los
//      callback_data esperados (misma transformación que route.ts:189-197).
//   3. tareas_vencidas y tareas_hoy también generan taskButtons.
//   4. Intent NO de tareas → taskButtons undefined (aunque data sea array).
//   5. mis_tareas con data que NO es array → taskButtons undefined.
//   6. mis_tareas con array vacío → taskButtons [] (el webhook no envía
//      botones cuando no hay tareas).

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildTaskButtonsMarkup } from '@/lib/telegram/task-buttons';

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

function classification(intent: string, params: Record<string, string> = {}) {
  return {
    intent,
    confidence: 0.95,
    needsMoreInfo: false,
    missingParams: [],
    extractedParams: params,
  };
}

// Misma transformación que app/api/webhooks/telegram/route.ts:189-197,
// ahora importada del helper compartido lib/telegram/task-buttons.ts.
function buildWebhookRows(taskButtons: { taskId: string; titulo: string }[]) {
  return buildTaskButtonsMarkup(taskButtons).inline_keyboard;
}

beforeEach(() => {
  vi.clearAllMocks();
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
    if (data.hubMetadata !== undefined) {
      state.hubMetadata = data.hubMetadata;
    }
    return { id: CONV };
  });
  mocks.messageFindMany.mockResolvedValue([]);
  mocks.messageCreate.mockResolvedValue({ id: 'msg-1' });
  mocks.userFindUnique.mockResolvedValue(null);
  mocks.userFindFirst.mockResolvedValue({ name: 'Bruno Hess', bookingEnabled: true, bookingSlug: 'bruno-hess' });
  mocks.isDestructive.mockReturnValue(false);
  mocks.extractFacts.mockResolvedValue([]);
  mocks.needsSummarization.mockReturnValue(false);

  vi.setSystemTime(new Date('2026-08-18T15:00:00Z'));
});

describe('processMessage → taskButtons para listados de tareas', () => {
  const TASKS = [
    { id: 'task-1', titulo: 'Llamar a Juan', fechaVencimiento: new Date('2026-08-17T10:00:00Z') },
    { id: 'task-2', titulo: 'Revisar cotización', fechaVencimiento: new Date('2026-08-18T10:00:00Z') },
  ];

  function setupMisTareas(data: any) {
    mocks.classify.mockResolvedValue(classification('mis_tareas'));
    mocks.createPlan.mockResolvedValue({
      success: true,
      plan: { steps: [{ action: 'get_pending_tasks', params: { tenantId: TENANT } }] },
    });
    mocks.run.mockResolvedValue({ message: 'Tienes 2 tareas pendientes', data });
  }

  it('devuelve taskButtons con una entrada {taskId, titulo} por tarea para mis_tareas', async () => {
    setupMisTareas(TASKS);

    const result = await processMessage({
      tenantId: TENANT,
      message: 'mis tareas',
      channel: 'telegram',
    });

    expect(result.success).toBe(true);
    expect(result.taskButtons).toBeDefined();
    expect(result.taskButtons).toHaveLength(2);
    expect(result.taskButtons?.[0]).toEqual({ taskId: 'task-1', titulo: 'Llamar a Juan' });
    expect(result.taskButtons?.[1]).toEqual({ taskId: 'task-2', titulo: 'Revisar cotización' });
  });

  it('cada entrada de taskButtons genera una fila de 3 botones con los callback_data correctos', async () => {
    setupMisTareas(TASKS);

    const result = await processMessage({
      tenantId: TENANT,
      message: 'mis tareas',
      channel: 'telegram',
    });

    const rows = buildWebhookRows(result.taskButtons!);
    expect(rows).toHaveLength(2);
    // Fila 1: 3 botones
    expect(rows[0]).toHaveLength(3);
    expect(rows[0].map((b) => b.callback_data)).toEqual([
      'task:complete:task-1',
      'task:resched:task-1',
      'task:snooze:task-1',
    ]);
    expect(rows[0].map((b) => b.text)).toEqual([
      '✅ Completar',
      '📅 Reprogramar',
      '⏰ Recordar más tarde',
    ]);
    // Fila 2
    expect(rows[1].map((b) => b.callback_data)).toEqual([
      'task:complete:task-2',
      'task:resched:task-2',
      'task:snooze:task-2',
    ]);
  });

  it('tareas_vencidas y tareas_hoy también generan taskButtons', async () => {
    for (const intent of ['tareas_vencidas', 'tareas_hoy']) {
      mocks.classify.mockResolvedValue(classification(intent));
      mocks.createPlan.mockResolvedValue({
        success: true,
        plan: { steps: [{ action: 'get_overdue_tasks', params: { tenantId: TENANT } }] },
      });
      mocks.run.mockResolvedValue({ message: 'Tienes tareas', data: TASKS });

      const result = await processMessage({
        tenantId: TENANT,
        message: intent,
        channel: 'telegram',
      });

      expect(result.taskButtons).toHaveLength(2);
      expect(result.taskButtons?.[0].taskId).toBe('task-1');
    }
  });

  it('NO genera taskButtons para un intent que no es listado de tareas (aunque data sea array)', async () => {
    mocks.classify.mockResolvedValue(classification('crear_lead'));
    mocks.createPlan.mockResolvedValue({
      success: true,
      plan: { steps: [{ action: 'create_lead', params: { tenantId: TENANT } }] },
    });
    mocks.run.mockResolvedValue({ message: 'Lead creado', data: [{ id: 'lead-1' }] });

    const result = await processMessage({
      tenantId: TENANT,
      message: 'crea un lead',
      channel: 'telegram',
    });

    expect(result.success).toBe(true);
    expect(result.taskButtons).toBeUndefined();
  });

  it('NO genera taskButtons cuando el skill devuelve data que no es array', async () => {
    setupMisTareas({ message: 'no soy un array' });

    const result = await processMessage({
      tenantId: TENANT,
      message: 'mis tareas',
      channel: 'telegram',
    });

    expect(result.taskButtons).toBeUndefined();
  });

  it('devuelve taskButtons [] (sin filas) cuando no hay tareas pendientes', async () => {
    setupMisTareas([]);

    const result = await processMessage({
      tenantId: TENANT,
      message: 'mis tareas',
      channel: 'telegram',
    });

    expect(result.taskButtons).toEqual([]);
    expect(buildWebhookRows(result.taskButtons!)).toEqual([]);
  });
});
