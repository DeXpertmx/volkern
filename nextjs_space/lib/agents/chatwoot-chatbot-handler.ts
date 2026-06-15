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
import { GemmaRouterAgent, DetectedIntent } from './gemma-router';
import { SkillOrchestratorAgent, ExecutionPlan } from './skill-orchestrator';
import { ExecutionEngine } from './execution-engine';
// @ts-expect-error - types not matching actual exports
// eslint-disable-next-line no-duplicate-imports
import type { ExecutionResult } from './execution-engine';
// @ts-expect-error - types not matching actual exports
import type { ResponseFormatter } from './response-formatter';
import { ChatbotAuditLogger } from './audit-logger';
import { SecurityCheckpointAgent } from './security-checkpoint';
import { ConversationContextAgent } from './conversation-context';
import { syncOutgoingChatwootMessage } from '@/lib/skills/chatwoot-sync-skill';
import {
  buildWelcomeButtons,
  buildServicesList,
  buildPostBookingButtons,
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

    // 2. Obtener o crear contexto de conversación con el agente mejorado
    const context = await ConversationContextAgent.load({
      conversationId,
      userId: user.id,
      tenantId
    });
    
    // Agregar mensaje del usuario al historial
    await ConversationContextAgent.addMessage(context, 'user', content);

    // 3. Detectar intent con Gemma (usando resumen del contexto)
    const contextSummary = ConversationContextAgent.getSummary(context);
    
    const intentResult = await GemmaRouterAgent.detectIntent(content, {
      pendingIntent: contextSummary.pendingIntent,
      collectedEntities: contextSummary.entities,
      missingEntities: contextSummary.missing
    });

    if (!intentResult.success || !intentResult.data) {
      await logAudit(tenantId, user.id, context, 'unknown', content, undefined, 'ERROR', intentResult.error);

      const fallbackMsg = intentResult.fallbackMessage || '🤔 No entendí bien tu mensaje. ¿Puedes reformularlo?';
      await sendResponseToChatwoot(tenantId, conversationId, fallbackMsg, payload);
      return;
    }

    const { intent, entities, missingEntities, confidence } = intentResult.data;

    // 4. SECURITY: Validar con SecurityCheckpointAgent
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) {
      await sendResponseToChatwoot(tenantId, conversationId, '❌ Error de configuración', payload);
      return;
    }

    try {
      await SecurityCheckpointAgent.validate({
        user: {
          id: user.id,
          tenantId: user.tenantId,
          role: (user.metadata as any)?.role,
          metadata: user.metadata
        },
        tenant: {
          id: tenant.id,
          plan: tenant.plan,
          estado: tenant.estado
        },
        intent,
        entities
      });
    } catch (securityError: any) {
      console.error('[Gemma] Security validation failed:', securityError.message);
      await logAudit(tenantId, user.id, context, intent, content, entities, 'BLOCKED_SECURITY', securityError.message);
      
      const errorMsg = securityError.message.includes('Rate limit')
        ? '⏳ Demasiadas solicitudes. Por favor, espera un momento.'
        : '🔒 No tienes permisos para realizar esta acción.';
      
      await sendResponseToChatwoot(tenantId, conversationId, errorMsg, payload);
      return;
    }

    // 4b. Loggear intent detectado
    await logAudit(tenantId, user.id, context, intent, content, entities, 'PENDING');

    // 5. Actualizar contexto con el intent detectado
    await ConversationContextAgent.updateIntent(context, intent, entities, missingEntities);

    // 6. Si hay missing entities, pedir la faltante (flujo multi-turno)
    if (missingEntities.length > 0) {
      const nextEntity = missingEntities[0];
      const prompt = getPromptForEntity(nextEntity);

      await sendResponseToChatwoot(tenantId, conversationId, prompt, payload);
      return;
    }

    // 7. Construir plan de ejecución
    const planResult = await (SkillOrchestratorAgent as any).buildExecutionPlan(
      intentResult.data,
      { ...context, userId: user.id } as any,
      tenantId
    );

    if (!planResult.success) {
      await logAudit(tenantId, user.id, context, intent, content, entities, 'ERROR', planResult.error);
      await sendResponseToChatwoot(tenantId, conversationId, planResult.error || 'Error desconocido', payload);
      return;
    }

    // Si hay response en lugar de plan, retornarlo
    if (planResult.response) {
      // Limpiar contexto (intento completado)
      await ConversationContextAgent.update(context, {
        pendingIntent: undefined,
        missingEntities: []
      });

      await logAudit(tenantId, user.id, context, intent, content, entities, 'SUCCESS', undefined, planResult.response);
      await sendResponseToChatwoot(tenantId, conversationId, planResult.response, payload);
      return;
    }

    if (!planResult.plan) {
      await sendResponseToChatwoot(tenantId, conversationId, '❌ No pude procesar tu solicitud.', payload);
      return;
    }

    // 8. Ejecutar el plan
    const executionResult = await (ExecutionEngine as any).execute(
      planResult.plan,
      {
        tenantId,
        userId: user.id,
        telegramUserId: telegramChatId,
        sessionId: conversationId
      }
    );

    // 9. Formatear y enviar respuesta
    let responseText: string;

    if (executionResult.success) {
      responseText = (ExecutionEngine as any).formatSkillResult(planResult.plan.skillName, executionResult.data);
      // Limpiar contexto (intento completado)
      await ConversationContextAgent.update(context, {
        pendingIntent: undefined,
        missingEntities: []
      });
    } else {
      responseText = executionResult.error || '❌ Ocurrió un error al procesar tu solicitud.';
    }

    // Agregar respuesta al historial
    await ConversationContextAgent.addMessage(context, 'assistant', responseText);

    // 10. Enviar respuesta
    await sendResponseToChatwoot(tenantId, conversationId, responseText, payload);

    // 11. Loggear resultado final
    await logAudit(
      tenantId,
      user.id,
      context,
      intent,
      content,
      entities,
      executionResult.success ? 'SUCCESS' : 'ERROR',
      executionResult.error,
      responseText
    );

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

    if (interactiveCtx.showWelcome) {
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

function getPromptForEntity(entity: string): string {
  const prompts: Record<string, string> = {
    date: '📅 ¿Para qué fecha te gustaría? (puedes decir "mañana", "hoy", o una fecha específica como "15/05")',
    time: '⏰ ¿A qué hora te viene bien? (por ejemplo, 10:00, 14:30)',
    service: '📋 ¿Qué servicio necesitas?',
    customer_name: '👤 ¿Cuál es tu nombre?',
    phone: '📱 ¿Cuál es tu número de teléfono?',
    email: '📧 ¿Cuál es tu correo electrónico?'
  };
  return prompts[entity] || `❓ ¿Podrías proporcionarme ${entity}?`;
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