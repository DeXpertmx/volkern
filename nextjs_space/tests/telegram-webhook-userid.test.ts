// @vitest-environment node
//
// Test de integración anti-regresión del fix dd89a80:
//
//   "El webhook de Telegram debe pasar `userId: telegram:<chatId>` al pipeline
//    y createTaskWrapper debe crear la tarea con `asignadoA` resuelto al User
//    real del tenant (vía metadata.telegram_chat_id)."
//
// Contexto del bug (producción): el webhook llamaba a `processMessage` SIN
// `userId`, así que el pipeline usaba `conv.id` (id de conversación) como
// userId → createTaskWrapper ponía ese id como `asignadoA` → violación de la
// FK `Task_asignadoA_fkey` (no existe ningún User con ese id). El fix hace
// que el webhook pase `userId: 'telegram:<chatId>'` (mismo patrón que ya
// usaban los callbacks task:*) y `resolveRealUserId` lo convierte al User
// real del tenant.
//
// Partes cubiertas:
//   1. Contrato webhook → pipeline: POST al route real con la pipeline
//      mockeada, verificando que `processMessage` recibe
//      `userId: 'telegram:<chatId>'` (y no conv.id).
//   2. Render de la respuesta: el texto del pipeline se reenvía al chat y,
//      cuando el pipeline devuelve `taskButtons`, se adjunta la fila de
//      3 botones (✅ Completar / 📅 Reprogramar / ⏰ Recordar más tarde).
//   3. createTaskWrapper (skills.create_task REAL, prisma mockeado):
//      `userId: 'telegram:<chatId>'` → `asignadoA` = id del User real.
//      Además garantiza el fix de canal: NUNCA escribe un id no-User en
//      `asignadoA` (era la violación de FK Task_asignadoA_fkey). Los canales
//      que no tienen User real (WhatsApp pasa leadId, widget web pasa
//      conv.id/sesión) crean la tarea SIN asignar (asignadoA null) en vez de
//      crashear.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ─── Mocks ────────────────────────────────────────────────────────────────

const mocks = vi.hoisted(() => {
  const prisma = {
    integration: { findMany: vi.fn() },
    user: { findFirst: vi.fn() },
    task: { create: vi.fn() },
    lead: { findFirst: vi.fn() },
    contact: { findFirst: vi.fn() },
    expenseInboxDocument: { findFirst: vi.fn(), findMany: vi.fn(), updateMany: vi.fn() },
  };
  return {
    prisma,
    processMessage: vi.fn(),
    sendBotMessage: vi.fn(),
    eventBusEmit: vi.fn(),
  };
});

// El route importa `prisma` como default; los skills como named export.
vi.mock('@/lib/db', () => ({ prisma: mocks.prisma, default: mocks.prisma }));

vi.mock('@/lib/s3', () => ({ getDownloadUrl: vi.fn(), uploadFile: vi.fn() }));
vi.mock('@/app/api/erp/expenses/scan/route', () => ({ callVision: vi.fn() }));
vi.mock('@/lib/finance/expense-inbox', () => ({ createExpenseInboxDocument: vi.fn() }));

// Pipeline unificado mockeado: el test verifica el CONTRATO de entrada/salida
// del webhook sin ejecutar el engine real (esa parte ya la cubren
// process-message-task-buttons.test.ts y telegram-user-resolve.test.ts).
vi.mock('@/lib/chat/chatbot-service', () => ({ processMessage: mocks.processMessage }));

vi.mock('@/lib/telegram/quick-replies', () => ({
  sendBotMessage: mocks.sendBotMessage,
  buildQuickReplyMarkup: vi.fn((qs: any[]) => ({
    inline_keyboard: qs.map((q) => [{ text: q, callback_data: `qr:${q}` }]),
  })),
  clearReplyMarkup: vi.fn(),
  parseQuickReplyCallback: vi.fn(() => null),
}));

// Mocks mínimos para que `@/lib/skills` (createTaskWrapper) cargue en vitest.
vi.mock('@/lib/skills/event-bus', () => ({
  eventBus: { emitEvent: mocks.eventBusEmit },
  EVENTS: { TASK_CREATED: 'TASK_CREATED' },
}));
vi.mock('@/lib/security/integrity-service', () => ({
  generateIntegrityHash: vi.fn().mockResolvedValue('hash-abc'),
  verifyFinancialIntegrity: vi.fn().mockResolvedValue(true),
}));
vi.mock('@/lib/skills/finance-skills', () => ({
  createExpense: vi.fn(async (i: any) => ({ id: 'exp-1', ...i })),
  createSupplier: vi.fn(async (i: any) => ({ id: 'supp-new', ...i })),
  registerExpenseVision: vi.fn(async () => ({})),
  analyzeBurnRate: vi.fn(async () => ({})),
}));

import { POST } from '@/app/api/webhooks/telegram/route';
import { skills } from '@/lib/skills';

// ─── Helpers ──────────────────────────────────────────────────────────────

const TENANT = 'tenant-1';
const BOT_TOKEN = '123456:ABC-DEF';

/**
 * Contexto de integración: el chatId del admin coincide con admin_chat_id.
 */
function mockTelegramContext(chatId: string) {
  mocks.prisma.integration.findMany.mockResolvedValue([
    { id: 'int-1', tenantId: TENANT, credenciales: { bot_token: BOT_TOKEN, admin_chat_id: chatId } },
  ]);
}

function makeMessageUpdate(text: string, chatId: string, updateId: number) {
  return {
    update_id: updateId,
    message: {
      message_id: 1,
      from: { id: Number(chatId), first_name: 'Bruno', last_name: 'Hess', is_bot: false },
      chat: { id: Number(chatId), first_name: 'Bruno', last_name: 'Hess', type: 'private' },
      date: 1756000000,
      text,
    },
  };
}

/**
 * POST real al route del webhook.
 * Cada llamada usa chatId y updateId DISTINTOS: los caches in-memory del
 * módulo (rate-limit por chat y anti-duplicado por update_id) persisten
 * entre tests dentro del mismo archivo.
 */
function postMessage(text: string, chatId: string, updateId: number) {
  mockTelegramContext(chatId);
  return POST(
    new NextRequest('https://volkern.app/api/webhooks/telegram', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(makeMessageUpdate(text, chatId, updateId)),
    })
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.processMessage.mockResolvedValue({ success: true, response: '✅ Listo' });
  mocks.sendBotMessage.mockResolvedValue({ ok: true });
});

// ─── 1. Contrato webhook → pipeline ───────────────────────────────────────

describe('Webhook de Telegram → pipeline: contrato de userId', () => {
  it('pasa userId telegram:<chatId> al pipeline (nunca el id de conversación)', async () => {
    const res = await postMessage(
      'crea una tarea de llamar a María para mañana',
      '646107192',
      900000001
    );

    expect(res.status).toBe(200);
    expect(mocks.processMessage).toHaveBeenCalledTimes(1);

    const input = mocks.processMessage.mock.calls[0][0];
    // EL contrato que protege contra la violación de FK Task_asignadoA_fkey:
    // el userId debe ser el chat en formato telegram:<chatId> para que
    // resolveRealUserId lo convierta al User real.
    expect(input.userId).toBe('telegram:646107192');
    expect(input.conversationId).toBe('telegram:646107192');
    expect(input.tenantId).toBe(TENANT);
    expect(input.channel).toBe('telegram');
    expect(input.message).toBe('crea una tarea de llamar a María para mañana');
  });

  it('reenvía la respuesta del pipeline al chat correcto con el bot del tenant', async () => {
    mocks.processMessage.mockResolvedValue({
      success: true,
      response: '✅ Tarea creada: llamar a María',
    });

    await postMessage('crea una tarea de llamar a María para mañana', '646107193', 900000002);

    expect(mocks.sendBotMessage).toHaveBeenCalledWith(
      '646107193',
      '✅ Tarea creada: llamar a María',
      BOT_TOKEN,
      undefined
    );
  });

  it('renderiza la fila de 3 botones de tarea cuando el pipeline devuelve taskButtons', async () => {
    mocks.processMessage.mockResolvedValue({
      success: true,
      response: '✅ Tarea creada: llamar a María',
      taskButtons: [{ taskId: 't-1', titulo: 'llamar a María' }],
    });

    await postMessage('crea una tarea de llamar a María para mañana', '646107194', 900000003);

    const [, , , replyMarkup] = mocks.sendBotMessage.mock.calls[0];
    const row = replyMarkup.inline_keyboard[0];
    expect(row.map((b: any) => b.callback_data)).toEqual([
      'task:complete:t-1',
      'task:resched:t-1',
      'task:snooze:t-1',
    ]);
  });
});

// ─── 2. createTaskWrapper → asignadoA resuelto al User real ───────────────

describe('createTaskWrapper (skills.create_task): resolución de asignadoA', () => {
  beforeEach(() => {
    // El chat de Telegram NO es el id de ningún usuario → las dos primeras
    // consultas de resolveRealUserId devuelven null. Solo la consulta por
    // metadata (telegram_chat_id / telegram.chat_id) encuentra al usuario.
    mocks.prisma.user.findFirst.mockImplementation((args: any) => {
      const where = args?.where || {};
      if (where.metadata || (Array.isArray(where.OR) && where.OR.some((o: any) => o.metadata))) {
        return Promise.resolve({ id: 'user-42' } as any);
      }
      return Promise.resolve(null);
    });
    mocks.prisma.lead.findFirst.mockResolvedValue({ id: 'lead-1' } as any);
    mocks.prisma.task.create.mockResolvedValue({ id: 't-new' } as any);
  });

  it('asigna la tarea al User real cuando el webhook pasa telegram:<chatId>', async () => {
    await (skills as any).create_task({
      tenantId: TENANT,
      titulo: 'llamar a María',
      email: 'maria@test.com',
      userId: 'telegram:646107192', // lo que el webhook pasa (contrato anterior)
    });

    const createCall = mocks.prisma.task.create.mock.calls[0][0];
    // asignadoA debe ser el User REAL (user-42), nunca el chat ni conv.id
    expect(createCall.data.asignadoA).toBe('user-42');

    // La resolución consultó el metadata telegram del usuario del tenant
    const metadataCall = mocks.prisma.user.findFirst.mock.calls.find((c: any) => {
      const w = c[0]?.where || {};
      return w.metadata || (Array.isArray(w.OR) && w.OR.some((o: any) => o.metadata));
    });
    expect(metadataCall).toBeTruthy();
  });

  it('fix de canal: un conv.id (widget web) no resoluble NUNCA se escribe en asignadoA (null, sin FK crash)', async () => {
    // Ningún usuario del tenant existe para ese id → resolveRealUserId null
    mocks.prisma.user.findFirst.mockResolvedValue(null);

    await (skills as any).create_task({
      tenantId: TENANT,
      titulo: 'llamar a María',
      email: 'maria@test.com',
      userId: 'conv-abc123', // lo que el widget web pasa (conv.id / sesión)
    });

    const createCall = mocks.prisma.task.create.mock.calls[0][0];
    // Antes del fix esto era 'conv-abc123' → violación de FK
    // Task_asignadoA_fkey. Ahora la tarea se crea sin asignar.
    expect(createCall.data.asignadoA).toBeNull();
  });

  it('fix de canal: WhatsApp (userId = leadId) crea la tarea sin asignar pero ligada al lead', async () => {
    // El webhook de Evolution pasa leadId como userId (no hay User para un
    // cliente) → resolveRealUserId no encuentra ningún User.
    mocks.prisma.user.findFirst.mockResolvedValue(null);

    await (skills as any).create_task({
      tenantId: TENANT,
      titulo: 'Quiero información',
      email: 'cliente@test.com',
      userId: 'lead-1', // lo que lib/chatbot-engine.ts pasa (leadId)
    });

    const createCall = mocks.prisma.task.create.mock.calls[0][0];
    expect(createCall.data.asignadoA).toBeNull();
    expect(createCall.data.leadId).toBe('lead-1');
  });
});

// ─── 3. Rate-limit: 429 explícito en vez de descarte silencioso ───────────
//
// Regresión del fix: antes, el segundo mensaje del mismo chat dentro de la
// ventana (1.5s) se descartaba silenciosamente con { ok: true } y el mensaje
// se perdía. Ahora responde HTTP 429 + Retry-After para que Telegram reintente
// el webhook y el mensaje no se pierda.
//
// El rate-limit se evalúa ANTES del anti-duplicado de update_id, así que el
// update rechazado NO queda marcado como procesado y su reintento sí pasa.
describe('Rate-limit del webhook: 429 explícito (sin descarte silencioso)', () => {
  it('el primer mensaje del chat pasa (200) y llega al pipeline', async () => {
    const res = await postMessage('hola', '646107199', 910000001);
    expect(res.status).toBe(200);
    expect(mocks.processMessage).toHaveBeenCalledTimes(1);
  });

  it('el segundo mensaje del MISMO chat en la ventana devuelve 429 con Retry-After y NO llega al pipeline', async () => {
    // Se ejecuta inmediatamente después del test anterior → mismo chat dentro
    // de la ventana de 1.5s del rate-limit.
    const res = await postMessage('hola de nuevo', '646107199', 910000002);
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('2');
    // El mensaje no se procesa ni se marca como anti-duplicado
    expect(mocks.processMessage).toHaveBeenCalledTimes(0);

    // Reintento simulado de Telegram: el mismo update_id debe PASAR ahora
    // (el 429 no lo marcó como procesado). Como el rate-limit de 1.5s ya
    // expiró en la ventana de 2s de Retry-After, el reintento se procesa.
    await new Promise((r) => setTimeout(r, 1600));
    const retry = await postMessage('hola de nuevo', '646107199', 910000002);
    expect(retry.status).toBe(200);
    expect(mocks.processMessage).toHaveBeenCalledTimes(1);
  });

  it('un chat distinto no se ve afectado por el rate-limit de otro chat', async () => {
    const res = await postMessage('hola otro chat', '646107200', 910000003);
    expect(res.status).toBe(200);
    expect(mocks.processMessage).toHaveBeenCalledTimes(1);
  });
});
