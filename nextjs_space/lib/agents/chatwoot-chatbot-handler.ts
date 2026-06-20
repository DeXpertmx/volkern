/**
 * Chatwoot Chatbot Handler - Gemma AI Agent
 * 
 * Se integra con el evento MESSAGE_RECEIVED de Chatwoot para procesar
 * mensajes de Telegram y responder con IA.
 * 
 * ARQUITECTURA:
 * Telegram → Chatwoot → Webhook → MESSAGE_RECEIVED → Pipeline de Agentes → Chatwoot → Telegram
 */

import { prisma } from '@/lib/db';
import { eventBus, EVENTS } from '@/lib/skills/event-bus';
import { ChatbotAuditLogger } from './audit-logger';
import { SecurityCheckpointAgent } from './security-checkpoint';
import { syncOutgoingChatwootMessage } from '@/lib/skills/chatwoot-sync-skill';
import {
  buildWelcomeButtons,
  buildServicesList,
  buildPostBookingButtons,
  buildQuickReplyButtons,
  detectInteractiveContext,
} from '@/lib/messaging/interactive';
import { processMessage as unifiedProcessMessage } from '@/lib/chat/chatbot-service';

interface ChatwootMessagePayload {
  tenantId: string;
  messageId: string;
  conversationId: string;
  content: string;
  canal: string;
  source: string;
  timestamp: Date;
  metadata: {
    sender_type?: string;
    channel_type?: string;
    accountId?: number;
    inboxId?: number;
    localConversationId?: string;
    localMessageId?: string;
    contact?: {
      id?: number;
      name?: string;
      email?: string;
      phone?: string;
    };
  };
}

// Timeout para todo el agente (ms)
const AGENT_TIMEOUT_MS = 8000;

// Fallback response cuando algo falla
const FALLBACK_RESPONSE = '⏳ Estoy procesando tu solicitud. Por favor, espera un momento...';

export async function handleChatwootMessage(payload: ChatwootMessagePayload) {
  const startTime = Date.now();
  const { tenantId, content, conversationId, metadata } = payload;

  // 🔐 1. Validar conversationId del payload
  if (!conversationId) {
    console.error('[Gemma] ERROR: No conversationId en payload');
    return;
  }

  // 🔐 2. Validar accountId si está en metadata
  if (metadata?.accountId) {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { configuracion: true }
    });
    
    const expectedAccountId = (tenant?.configuracion as any)?.chatwootAccountId;
    
    if (expectedAccountId && expectedAccountId !== metadata.accountId) {
      console.error('[Gemma] ERROR: Cross-tenant conversation attempt');
      await sendFallbackResponse(tenantId, conversationId, payload);
      return;
    }
  }

  // SECURITY: Validar tenantId presente
  if (!tenantId) {
    console.error('[Gemma] ERROR: No tenantId en el payload');
    return;
  }

  // Determinar si es WhatsApp (flujo simplificado sin user auth)
  const channelType = metadata?.channel_type || '';
  const isWhatsApp = channelType.toLowerCase().includes('whatsapp') || channelType.toLowerCase().includes('sms');

  // Verificar que es un mensaje de contacto (no del sistema)
  // Para WhatsApp/SMS, los mensajes siempre vienen de contactos externos
  if (!isWhatsApp && metadata?.sender_type !== 'contact') {
    console.log('[Gemma] Ignorando mensaje de sistema');
    return;
  }

  // Verificar que es un canal soportado (Telegram, WhatsApp, SMS)
  const isSupported = ['telegram', 'whatsapp', 'sms'].some(ch => channelType.toLowerCase().includes(ch));
  if (!isSupported) {
    console.log('[Gemma] Ignorando mensaje de canal no soportado:', channelType);
    return;
  }

  console.log(`[Gemma] Procesando mensaje para tenant ${tenantId}, conversación ${conversationId}, canal: ${channelType}`);

  // Si es WhatsApp, usar el flujo simplificado (lead-based, sin user auth)
  if (isWhatsApp) {
    const processingPromise = processWhatsAppMessage(payload);
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('TIMEOUT')), AGENT_TIMEOUT_MS);
    });

    try {
      await Promise.race([processingPromise, timeoutPromise]);
    } catch (error) {
      console.error('[Gemma] Error o timeout en WhatsApp:', error instanceof Error ? error.message : 'Unknown');
      await sendFallbackResponse(tenantId, conversationId, payload);
      await ChatbotAuditLogger.log({
        tenantId,
        conversationId,
        inputRaw: content,
        status: (error instanceof Error && error.message === 'TIMEOUT' ? 'TIMEOUT' : 'ERROR') as any,
        errorMessage: error instanceof Error ? error.message : 'Unknown error'
      } as any);
    }
    return;
  }

  // ⏱️ Timeout wrapper para Telegram (flujo completo con user auth)
  const processingPromise = processMessage(payload);
  
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error('TIMEOUT')), AGENT_TIMEOUT_MS);
  });

  try {
    await Promise.race([processingPromise, timeoutPromise]);
  } catch (error) {
    console.error('[Gemma] Error o timeout:', error instanceof Error ? error.message : 'Unknown');
    
    // 📤 Fallback response si hay timeout o error
    await sendFallbackResponse(tenantId, conversationId, payload);
    
    // Loggear error
    await ChatbotAuditLogger.log({
      tenantId,
      conversationId,
      inputRaw: content,
      status: (error instanceof Error && error.message === 'TIMEOUT' ? 'TIMEOUT' : 'ERROR') as any,
      errorMessage: error instanceof Error ? error.message : 'Unknown error'
    } as any);
  }
}

async function processMessage(payload: ChatwootMessagePayload) {
  const { tenantId, content, conversationId, metadata } = payload;

  try {
    // 1. Identificar usuario con doble mapeo
    const telegramChatId = metadata?.contact?.id?.toString() || metadata?.contact?.phone;
    const chatwootContactId = metadata?.contact?.id?.toString();
    const contactEmail = metadata?.contact?.email;

    const user = await findUserByTelegramOrContact(tenantId, telegramChatId, chatwootContactId, contactEmail);

    if (!user) {
      console.log('[Gemma] Usuario no identificado, enviando mensaje de vinculación');
      const welcomeMsg = `👋 ¡Hola! Soy *Gemma*, tu asistente IA de Volkern.\n\nPara usar mis servicios, conecta tu Telegram en tu perfil de Volkern.`;
      await sendResponseToChatwoot(tenantId, conversationId, welcomeMsg, payload);
      
      await ChatbotAuditLogger.log({
        tenantId,
        telegramUserId: telegramChatId,
        chatwootContactId,
        inputRaw: content,
        status: 'BLOCKED_PERMISSION',
        errorMessage: 'Usuario no vinculado'
      });
      return;
    }

    // SECURITY: Verificar si el usuario está bloqueado
    const isBlocked = await SecurityCheckpointAgent.isUserBlocked(tenantId, user.id);
    if (isBlocked) {
      console.log(`[Gemma] Usuario ${user.id} bloqueado`);
      await sendResponseToChatwoot(tenantId, conversationId, '❌ Tu acceso ha sido bloqueado. Contacta al administrador.', payload);
      return;
    }

    // SECURITY: Verificar que el usuario pertenece al tenant correcto
    if (user.tenantId !== tenantId) {
      console.error(`[Gemma] ERROR: Cross-tenant detected! User ${user.id} tenant ${user.tenantId} != payload tenant ${tenantId}`);
      await ChatbotAuditLogger.log({
        tenantId,
        userId: user.id,
        inputRaw: content,
        status: 'BLOCKED_SECURITY',
        errorMessage: 'Cross-tenant execution blocked'
      });
      return;
    }

    // 2. Usar el pipeline unificado (mismo que WhatsApp)
    const result = await unifiedProcessMessage({
      tenantId,
      message: content,
      channel: 'telegram',
      contactName: metadata?.contact?.name || user.metadata?.telegram?.firstName,
      contactPhone: metadata?.contact?.phone || undefined,
      contactEmail: metadata?.contact?.email || undefined,
      userId: user.id,
      conversationId,
    });

    if (!result.success) {
      if (result.error !== 'rate_limit') {
        await logAudit(tenantId, user.id, { conversationId }, 'consulta_general', content, undefined, 'ERROR', result.error);
        await sendResponseToChatwoot(tenantId, conversationId, result.response || 'Lo siento, no pude procesar tu mensaje.', payload);
      }
      return;
    }

    if (result.fueraHorario && result.response) {
      await sendResponseToChatwoot(tenantId, conversationId, result.response, payload);
      return;
    }

    // 3. Convertir quickReplies a botones interactivos para Telegram
    let interactiveData: { contentType: string; contentAttributes: Record<string, any> } | undefined;
    if (result.quickReplies && result.quickReplies.length > 0) {
      const buttons = result.quickReplies.slice(0, 3).map((reply, i) => ({
        id: `qr_${i}`,
        title: reply.length > 20 ? reply.substring(0, 17) + '...' : reply,
        type: 'reply' as const,
      }));
      interactiveData = buildQuickReplyButtons(
        result.response.length > 900 ? result.response.substring(0, 897) + '...' : result.response,
        buttons,
        undefined,
        'Toca una opción para filtrar'
      );
    }

    // 4. Enviar respuesta
    await sendResponseToChatwoot(tenantId, conversationId, result.response, payload, interactiveData);

    // 5. Loggear resultado
    await logAudit(tenantId, user.id, { conversationId }, result.response ? 'success' : 'consulta_general', content, undefined, 'SUCCESS', undefined, result.response);

    console.log('[Gemma/Telegram] ✅ Respuesta enviada vía pipeline unificado', interactiveData ? '(interactiva)' : '');

  } catch (error) {
    console.error('[Gemma] Error fatal:', error);

    await ChatbotAuditLogger.log({
      tenantId,
      inputRaw: content,
      status: 'ERROR',
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
    });

    const errorMsg = '❌ Ocurrió un error inesperado. Por favor, intenta de nuevo.';
    await sendResponseToChatwoot(tenantId, conversationId, errorMsg, payload);
  }
}

/**
 * Procesa mensajes de WhatsApp (flujo simplificado sin user auth)
 * Usa LLM para generar respuestas y las envía vía Chatwoot API
 */
async function processWhatsAppMessage(payload: ChatwootMessagePayload) {
  const { tenantId, content, conversationId, metadata } = payload;
  const localConversationId = metadata?.localConversationId || conversationId;

  try {
    console.log('[Gemma/WhatsApp] Procesando mensaje:', content.substring(0, 50));

    const conversation = await prisma.conversation.findUnique({
      where: { id: localConversationId },
      select: { leadId: true, lead: { select: { id: true, nombre: true, email: true, telefono: true } } }
    });

    const result = await unifiedProcessMessage({
      tenantId,
      message: content,
      channel: 'whatsapp',
      contactName: conversation?.lead?.nombre,
      contactPhone: conversation?.lead?.telefono || undefined,
      contactEmail: conversation?.lead?.email || undefined,
      leadId: conversation?.leadId || undefined,
      conversationId: localConversationId,
    });

    if (!result.success) {
      if (result.error !== 'rate_limit') {
        await sendResponseToChatwoot(tenantId, conversationId, result.response || 'Lo siento, no pude procesar tu mensaje.', payload);
      }
      return;
    }

    if (result.fueraHorario && result.response) {
      await sendResponseToChatwoot(tenantId, conversationId, result.response, payload);
      return;
    }

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { nombre: true }
    });

    const services = await prisma.servicio.findMany({
      where: { tenantId, activo: true },
      select: { id: true, nombre: true, descripcion: true, duracionMinutos: true, precio: true, moneda: true }
    });

    const interactiveCtx = detectInteractiveContext(content, result.response, services.length > 0);
    let interactiveData: { contentType: string; contentAttributes: Record<string, any> } | undefined;

    // Prioridad: quick replies del catálogo > contexto interactivo
    if (result.quickReplies && result.quickReplies.length > 0) {
      const buttons = result.quickReplies.slice(0, 3).map((reply, i) => ({
        id: `qr_${i}`,
        title: reply.length > 20 ? reply.substring(0, 17) + '...' : reply,
        type: 'reply' as const,
      }));
      interactiveData = buildQuickReplyButtons(
        result.response.length > 900 ? result.response.substring(0, 897) + '...' : result.response,
        buttons,
        undefined,
        'Toca una opción para filtrar'
      );
    } else if (interactiveCtx.showWelcome) {
      interactiveData = buildWelcomeButtons(tenant?.nombre || '', 'Asistente Virtual');
    } else if (interactiveCtx.showServices && services.length > 0) {
      interactiveData = buildServicesList(services as any, tenant?.nombre || '');
    } else if (interactiveCtx.showPostBooking) {
      interactiveData = buildPostBookingButtons();
    }

    await sendResponseToChatwoot(tenantId, conversationId, result.response, payload, interactiveData);

    console.log('[Gemma/WhatsApp] ✅ Respuesta enviada:', result.response.substring(0, 50),
      interactiveData ? '(interactiva)' : '');

  } catch (error) {
    console.error('[Gemma/WhatsApp] Error:', error);
    await sendResponseToChatwoot(
      tenantId, conversationId,
      'Disculpa, estoy teniendo problemas técnicos. ¿Puedes intentar de nuevo?',
      payload
    );
  }
}

// Acciones WhatsApp ahora manejadas por ChatbotService unificado

/**
 * Busca usuario por múltiples identificadores
 */
async function findUserByTelegramOrContact(
  tenantId: string,
  telegramChatId?: string,
  chatwootContactId?: string,
  email?: string
): Promise<{ id: string; tenantId: string; metadata: any } | null> {
  // 1. Buscar por telegram_chat_id en metadata
  if (telegramChatId) {
    const users = await prisma.user.findMany({
      where: { tenantId },
      select: { id: true, tenantId: true, metadata: true }
    });

    const byTelegram = users.find(u => (u.metadata as any)?.telegram?.chat_id === telegramChatId);
    if (byTelegram) return byTelegram as { id: string; tenantId: string; metadata: any };
  }

  // 2. Buscar por chatwoot_contact_id en metadata
  if (chatwootContactId) {
    const users = await prisma.user.findMany({
      where: { tenantId },
      select: { id: true, tenantId: true, metadata: true }
    });

    const byChatwoot = users.find(u => (u.metadata as any)?.telegram?.chatwoot_contact_id === chatwootContactId);
    if (byChatwoot) return byChatwoot as { id: string; tenantId: string; metadata: any };
  }

  // 3. Buscar por email si está disponible
  if (email) {
    const user = await prisma.user.findUnique({
      where: { email }
    });
    if (user && user.tenantId === tenantId) {
      return { id: user.id, tenantId: user.tenantId ?? '', metadata: user.metadata };
    }
  }

  return null;
}

async function logAudit(
  tenantId: string,
  userId: string,
  context: any,
  intent: string,
  inputRaw: string,
  entities: Record<string, string> | undefined,
  status: string,
  errorMessage?: string,
  outputFormatted?: string
) {
  await ChatbotAuditLogger.log({
    tenantId,
    sessionId: context?.conversationId,
    userId,
    telegramUserId: context?.telegramChatId,
    chatwootContactId: context?.chatwootContactId,
    intent,
    detectedEntities: entities,
    status: status as any,
    errorMessage,
    inputRaw,
    outputFormatted
  });
}

async function sendResponseToChatwoot(
  tenantId: string,
  conversationId: string,
  message: string,
  originalPayload: ChatwootMessagePayload,
  interactive?: { contentType: string; contentAttributes: Record<string, any> }
) {
  try {
    const localConversationId = originalPayload.metadata?.localConversationId || conversationId;

    // Guardar metadata del interactive si existe
    const interactionMeta = interactive ? {
      contentType: interactive.contentType,
      hasInteractive: true,
    } : {};

    // Crear mensaje local
    const localMessage = await prisma.message.create({
      data: {
        conversationId: localConversationId,
        contenido: message,
        direccion: 'saliente',
        canal: 'chatwoot',
        estado: 'enviado',
        metadatos: Object.keys(interactionMeta).length > 0 ? interactionMeta : undefined,
      }
    }).catch(() => null);

    // Sincronizar con Chatwoot si tenemos el ID local
    if (localMessage) {
      await syncOutgoingChatwootMessage({
        tenantId: tenantId as string,
        conversationId: localConversationId,
        content: message,
        messageId: localMessage.id,
        ...(interactive?.contentType && { contentType: interactive.contentType }),
        ...(interactive?.contentAttributes && { contentAttributes: interactive.contentAttributes }),
      }).catch(err => console.error('[Gemma] Error sync outgoing:', err));
    }

    console.log(`[Gemma] Respuesta enviada a conversación ${conversationId}${interactive ? ' (interactiva)' : ''}`);
  } catch (error) {
    console.error('[Gemma] Error enviando respuesta:', error);
  }
}

/**
 * Envía mensaje de fallback cuando hay timeout o error
 */
async function sendFallbackResponse(
  tenantId: string,
  conversationId: string,
  originalPayload: ChatwootMessagePayload
): Promise<void> {
  try {
    await sendResponseToChatwoot(tenantId, conversationId, FALLBACK_RESPONSE, originalPayload);
    console.log(`[Gemma] Fallback response enviado para conversación ${conversationId}`);
  } catch (error) {
    console.error('[Gemma] Error enviando fallback response:', error);
  }
}

// ============================================================
// INICIALIZACIÓN DEL HANDLER
// ============================================================

export function initGemmaChatbot() {
  // Registrar handler para el evento MESSAGE_RECEIVED de Chatwoot
  eventBus.onEvent(EVENTS.MESSAGE_RECEIVED, async (payload: any) => {
    try {
      await handleChatwootMessage(payload as ChatwootMessagePayload);
    } catch (error) {
      console.error('[Gemma] Error en handler MESSAGE_RECEIVED:', error);
    }
  });

  console.log('✅ Gemma AI Agent inicializado - escuchando MESSAGE_RECEIVED');
}

// Helper para vincular Telegram manualmente (endpoint opcional)
export async function linkTelegramToUser(
  userId: string,
  telegramChatId: string,
  chatwootContactId?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return { success: false, error: 'Usuario no encontrado' };

    const metadata = (user.metadata as any) || {};
    metadata.telegram = {
      chat_id: telegramChatId,
      chatwoot_contact_id: chatwootContactId,
      linkedAt: new Date().toISOString()
    };

    await prisma.user.update({
      where: { id: userId },
      data: { metadata: metadata as any }
    });

    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Error desconocido' };
  }
}

export type { ChatwootMessagePayload };