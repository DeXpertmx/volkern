// @vitest-environment node
//
// Test de integración anti-regresión del rate-limit del webhook de Evolution
// (mismo patrón que el de Telegram):
//
//   "Aplica el mismo patrón 429 con Retry-After al webhook de
//    Evolution/WhatsApp si también descarta mensajes silenciosamente."
//
// Contexto (producción): el webhook real `/api/webhook/evolution/[instanceName]`
// NO tenía rate-limit — un contacto podía enviar N mensajes en ráfaga y todos
// se procesaban sin límite, y el catch final tragaba errores devolviendo 200
// (mensajes perdidos silenciosamente). Ahora:
//   1. El rate-limit por chat (remoteJid) vive en Redis compartido
//      (`evolution:rl:<phone>` con SET NX PX) — mismo helper que Telegram.
//   2. Si el chat excede la ventana, el webhook responde HTTP 429 +
//      Retry-After: 2 — Evolution API tiene reintento configurado
//      (WEBHOOK_RETRY_MAX_DELAY_SECONDS=300 y 429 NO está en
//      WEBHOOK_RETRY_NON_RETRYABLE_STATUS_CODES), así que reintenta el mismo
//      payload y el mensaje no se pierde.
//   3. El rate-limit se evalúa ANTES de tocar la BD (lead/conversación/
//      mensaje), así el reintento procesa el mensaje completo.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ─── Mocks ────────────────────────────────────────────────────────────────

const mocks = vi.hoisted(() => {
  const prisma = {
    userWhatsAppInstance: { findFirst: vi.fn() },
    tenantWhatsAppInstance: { findUnique: vi.fn(), update: vi.fn() },
    lead: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    conversation: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    message: { findUnique: vi.fn(), create: vi.fn() },
    channel: { findFirst: vi.fn() },
    messagingHubConfig: { findUnique: vi.fn() },
  };
  return {
    prisma,
    initRedis: vi.fn(),
    isMessageKeyRecentlySent: vi.fn(),
    markMessageKeyAsSent: vi.fn(),
    ensureChatwootInboxForInstance: vi.fn(),
    extractOwnerProfileFromConnection: vi.fn(),
    getProfileInfo: vi.fn(),
    chatwootApi: {
      ensureBotUserInAccount: vi.fn(),
      getOrCreateConversation: vi.fn(),
      sendMessage: vi.fn(),
      assignConversation: vi.fn(),
    },
    initGemmaChatbot: vi.fn(),
    eventBusEmit: vi.fn(),
  };
});

vi.mock('@/lib/db', () => ({ prisma: mocks.prisma, default: mocks.prisma }));

// Redis rate-limit compartido: por defecto Redis NO disponible → fallback en
// memoria (misma semántica). El test específico de Redis mockea el cliente.
vi.mock('@/lib/core/redis', () => ({ initRedis: mocks.initRedis }));

vi.mock('@/lib/evolution-instances', () => ({
  ensureChatwootInboxForInstance: mocks.ensureChatwootInboxForInstance,
  extractOwnerProfileFromConnection: mocks.extractOwnerProfileFromConnection,
  getProfileInfo: mocks.getProfileInfo,
  isMessageKeyRecentlySent: mocks.isMessageKeyRecentlySent,
  markMessageKeyAsSent: mocks.markMessageKeyAsSent,
}));

vi.mock('@/lib/nexus/chatwoot-api', () => ({ chatwootApi: mocks.chatwootApi }));
vi.mock('@/lib/agents/chatwoot-chatbot-handler', () => ({
  initGemmaChatbot: mocks.initGemmaChatbot,
}));
vi.mock('@/lib/skills/event-bus', () => ({
  eventBus: { emitEvent: mocks.eventBusEmit },
  EVENTS: { MESSAGE_RECEIVED: 'MESSAGE_RECEIVED' },
}));

import { POST } from '@/app/api/webhook/evolution/[instanceName]/route';

// ─── Helpers ──────────────────────────────────────────────────────────────

const INSTANCE = 'negocio_yr9grk30_fb3e64';
const TENANT_ID = 'tenant-1';

// Cada test usa un número de teléfono distinto: el fallback en memoria del
// rate-limit es un Map a nivel de módulo y persiste entre tests.
let PHONE = '5214421000001';

function mockInstance() {
  mocks.prisma.userWhatsAppInstance.findFirst.mockResolvedValue(null);
  mocks.prisma.tenantWhatsAppInstance.findUnique.mockResolvedValue({
    id: 'inst-1',
    instanceName: INSTANCE,
    tenantId: TENANT_ID,
    phoneNumber: null,
    status: 'connected',
  } as any);
}

/**
 * POST real al route del webhook. Cada llamada usa un messageId distinto:
 * los caches in-memory del módulo (rate-limit por chat) persisten entre
 * llamadas dentro del mismo test.
 */
function postMessage(messageId: string, text = 'Hola, me interesa el servicio', phone = PHONE) {
  const body = {
    event: 'messages.upsert',
    data: {
      key: {
        remoteJid: `${phone}@s.whatsapp.net`,
        fromMe: false,
        id: messageId,
      },
      pushName: 'Juan Pérez',
      message: { conversation: text },
    },
  };

  return POST(
    new NextRequest(`https://volkern.app/api/webhook/evolution/${INSTANCE}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    { params: { instanceName: INSTANCE } } as any
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.initRedis.mockResolvedValue(null); // fallback en memoria por defecto
  mocks.isMessageKeyRecentlySent.mockReturnValue(false);
  mockInstance();
  // Sin canal/hub Chatwoot configurado → el puente a Chatwoot se salta
  mocks.prisma.channel.findFirst.mockResolvedValue(null);
  mocks.prisma.lead.findFirst.mockResolvedValue({ id: 'lead-1' } as any);
  mocks.prisma.conversation.findFirst.mockResolvedValue({ id: 'conv-1' } as any);
  mocks.prisma.message.findUnique.mockResolvedValue(null);
  mocks.prisma.message.create.mockResolvedValue({ id: 'msg-1' } as any);
});

// ─── 1. Patrón 429 + Retry-After (sin descarte silencioso) ────────────────

describe('Rate-limit del webhook de Evolution: 429 explícito', () => {
  it('el primer mensaje del chat pasa (200) y se procesa', async () => {
    PHONE = '5214421000001';
    const res = await postMessage('MSG_001');
    expect(res.status).toBe(200);
    // El mensaje llegó a la BD (lead existente + conversación + mensaje)
    expect(mocks.prisma.message.create).toHaveBeenCalledTimes(1);
    expect(mocks.prisma.conversation.update).toHaveBeenCalled(); // noLeidos
  });

  it('el segundo mensaje del MISMO chat en la ventana devuelve 429 con Retry-After y NO toca la BD', async () => {
    // Se ejecuta inmediatamente después del test anterior → mismo chat dentro
    // de la ventana de 1.5s del rate-limit.
    PHONE = '5214421000002'; // mismo chat que el primer mensaje de este test
    const res = await postMessage('MSG_002');
    const resDup = await postMessage('MSG_002B');
    expect(res.status).toBe(200); // el primero del chat pasa
    expect(resDup.status).toBe(429);
    expect(resDup.headers.get('Retry-After')).toBe('2');
    const body = await resDup.json();
    expect(body.error).toBe('rate_limited');
    expect(body.retry_after).toBe(2);
    // El mensaje duplicado NO se procesó (solo el primero tocó la BD)
    expect(mocks.prisma.message.create).toHaveBeenCalledTimes(1);
  });

  it('un chat distinto no se ve afectado por el rate-limit de otro chat', async () => {
    PHONE = '5214421000003';
    const res = await postMessage('MSG_003');
    expect(res.status).toBe(200);
    expect(mocks.prisma.message.create).toHaveBeenCalledTimes(1);
  });
});

// ─── 2. Rate-limit compartido (Redis) con namespace evolution ─────────────

describe('Rate-limit compartido (Redis): namespace evolution', () => {
  it('usa la clave evolution:rl:<phone> con SET NX PX cuando Redis está disponible', async () => {
    PHONE = '5214421000004';
    const setMock = vi.fn()
      .mockResolvedValueOnce('OK')  // primer mensaje → pasa
      .mockResolvedValueOnce(null); // segundo mensaje → limitado

    mocks.initRedis.mockResolvedValue({ set: setMock });

    await postMessage('MSG_R1');
    const res2 = await postMessage('MSG_R2');

    expect(res2.status).toBe(429);
    // La clave lleva el namespace evolution (no mezcla con telegram)
    expect(setMock).toHaveBeenCalledWith(`evolution:rl:${PHONE}`, '1', 'PX', 1500, 'NX');
  });

  it('si Redis lanza error, degrada a memoria sin romper el webhook', async () => {
    PHONE = '5214421000005';
    mocks.initRedis.mockResolvedValue({ set: vi.fn().mockRejectedValue(new Error('conn refused')) });

    const res1 = await postMessage('MSG_D1');
    const res2 = await postMessage('MSG_D2');

    expect(res1.status).toBe(200);
    expect(res2.status).toBe(429);
  });
});
