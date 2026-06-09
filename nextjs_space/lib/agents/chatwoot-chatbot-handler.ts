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
      select: { configuracion: true, metadata: true } as any
    });
    
    const expectedAccountId = (tenant?.configuracion as any)?.chatwootAccountId || 
                              (tenant?.metadata as any)?.chatwootAccountId;
    
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

  // Verificar que es un mensaje de contacto (no del sistema)
  // Para WhatsApp, los mensajes siempre vienen de contactos externos
  if (!isWhatsApp && metadata?.sender_type !== 'contact') {
    console.log('[Gemma] Ignorando mensaje de sistema');
    return;
  }

  // Verificar que es un canal soportado (Telegram, WhatsApp, SMS)
  const channelType = metadata?.channel_type || '';
  const isSupported = ['telegram', 'whatsapp', 'sms'].some(ch => channelType.toLowerCase().includes(ch));
  if (!isSupported) {
    console.log('[Gemma] Ignorando mensaje de canal no soportado:', channelType);
    return;
  }

  // Determinar si es WhatsApp (flujo simplificado sin user auth)
  const isWhatsApp = channelType.toLowerCase().includes('whatsapp') || channelType.toLowerCase().includes('sms');

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
  const chatwootAccountId = metadata?.accountId;

  try {
    console.log('[Gemma/WhatsApp] Procesando mensaje:', content.substring(0, 50));

    if (!chatwootAccountId) {
      console.log('[Gemma/WhatsApp] Sin accountId, intentando obtener desde tenant');
    }

    // 1. Obtener configuración del tenant
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, nombre: true, plan: true }
    });

    if (!tenant) {
      await sendResponseToChatwoot(tenantId, conversationId, '❌ Error de configuración', payload);
      return;
    }

    // 2. Obtener el lead asociado a la conversación
    const conversation = await prisma.conversation.findUnique({
      where: { id: localConversationId },
      select: { leadId: true, lead: { select: { id: true, nombre: true, email: true, telefono: true } } }
    });

    const leadName = conversation?.lead?.nombre || 'Cliente';

    // 3. Cargar servicios disponibles
    const services = await prisma.servicio.findMany({
      where: { tenantId, activo: true },
      select: { id: true, nombre: true, descripcion: true, duracionMinutos: true, precio: true, moneda: true }
    });

    // 4. Cargar configuración del chatbot
    let chatbotConfig = await prisma.chatbotConfig.findUnique({ where: { tenantId } });
    if (!chatbotConfig) {
      chatbotConfig = await prisma.chatbotConfig.create({
        data: { tenantId, activo: true, nombreAsistente: 'Asistente Virtual' }
      });
    }

    if (!chatbotConfig.activo) {
      console.log('[Gemma/WhatsApp] Chatbot inactivo para este tenant');
      return;
    }

    // Verificar horario de atención
    const { isWithinBusinessHours } = await import('@/lib/chatbot-engine');
    if (!isWithinBusinessHours(chatbotConfig)) {
      console.log('[Gemma/WhatsApp] Fuera de horario de atención');
      if (chatbotConfig.mensajeFueraHorario) {
        await sendResponseToChatwoot(tenantId, conversationId, chatbotConfig.mensajeFueraHorario, payload);
      }
      return;
    }

    // 5. Verificar que el tenant tenga Chatwoot configurado
    const hubConfig = await prisma.messagingHubConfig.findUnique({
      where: { tenantId },
      select: { chatwootAccountId: true }
    });

    if (!chatwootAccountId && !hubConfig?.chatwootAccountId) {
      console.log('[Gemma/WhatsApp] No hay cuenta de Chatwoot configurada');
      return;
    }

    // 6. Rate limiting: evitar responder si ya se respondió en los últimos 2 segundos
    const lastBotMessage = await prisma.message.findFirst({
      where: {
        conversationId: localConversationId,
        direccion: 'saliente',
      },
      orderBy: { fechaCreacion: 'desc' },
      select: { fechaCreacion: true }
    });

    if (lastBotMessage?.fechaCreacion) {
      const msSinceLastResponse = Date.now() - new Date(lastBotMessage.fechaCreacion).getTime();
      if (msSinceLastResponse < 2000) {
        console.log('[Gemma/WhatsApp] Rate limit: última respuesta hace', msSinceLastResponse, 'ms');
        return;
      }
    }

    // 7. Cargar historial reciente de la conversación (últimos 6 mensajes)
    const recentMessages = await prisma.message.findMany({
      where: { conversationId: localConversationId },
      orderBy: { fechaCreacion: 'desc' },
      take: 6,
      select: { contenido: true, direccion: true }
    });

    // 8. Construir system prompt
    const servicesInfo = services.map(s =>
      `- ${s.nombre}: ${s.descripcion || 'Sin descripción'} | ${s.duracionMinutos}min | $${s.precio} ${s.moneda}`
    ).join('\n');

    const systemPrompt = `Eres ${chatbotConfig.nombreAsistente}, asistente virtual de ${tenant.nombre}.

${chatbotConfig.contextoNegocio || 'Ayudas a clientes por WhatsApp.'}
${chatbotConfig.personalidad || 'Eres cordial, profesional y conciso.'}

Cliente: ${leadName}

SERVICIOS:\n${servicesInfo || 'No hay servicios configurados.'}

INSTRUCCIONES:
1. Responde en español, sé amable y directo.
2. Si preguntan por servicios, descríbelos con precio y duración.
3. Si quieren agendar, responde: [AGENDAR:servicio|fecha|hora]
4. Si quieren hablar con humano, responde: [TRANSFERIR]
5. Usa formato WhatsApp: negritas con *texto*, emojis con moderación.
6. Máximo 2-3 párrafos. Sé conciso.`;

    // 9. Construir historial
    const historyMessages = recentMessages.reverse().map(m => ({
      role: (m.direccion === 'entrante' ? 'user' : 'assistant') as 'user' | 'assistant',
      content: m.contenido
    }));

    const llmMessages = [
      { role: 'system' as const, content: systemPrompt },
      ...historyMessages,
      { role: 'user' as const, content }
    ];

    // 10. Llamar LLM
    const { callAssistantWithFallback } = await import('@/lib/assistant/openrouter-client');
    const llmResponse = await callAssistantWithFallback(llmMessages as any);
    const assistantMessage = llmResponse.choices?.[0]?.message?.content ||
      'Gracias por tu mensaje. ¿En qué puedo ayudarte?';

    // 11. Detectar acciones especiales
    let finalMessage = assistantMessage;
    let action: string | undefined;

    const agendarMatch = assistantMessage.match(/\[AGENDAR:([^|]+)\|([^|]+)\|([^\]]+)\]/);
    if (agendarMatch) {
      action = 'agendar';
      finalMessage = assistantMessage.replace(/\[AGENDAR:[^\]]+\]/, '').trim();
    }
    if (assistantMessage.includes('[TRANSFERIR]')) {
      action = 'transferir';
      finalMessage = assistantMessage.replace('[TRANSFERIR]', '').trim();
    }

    // 12. Enviar respuesta vía Chatwoot
    await sendResponseToChatwoot(tenantId, conversationId, finalMessage, payload);

    // 13. Actualizar estadísticas
    await prisma.chatbotConfig.update({
      where: { tenantId },
      data: { totalConversaciones: { increment: 1 } }
    }).catch(() => {});

    // 14. Ejecutar acción si es necesario (agendar/transferir)
    if (action && conversation?.leadId) {
      await executeWhatsAppAction(action, {
        tenantId,
        leadId: conversation.leadId,
        conversationId: localConversationId,
        phoneNumber: conversation.lead?.telefono || '',
        services,
      }, agendarMatch ? {
        servicio: agendarMatch[1].trim(),
        fecha: agendarMatch[2].trim(),
        hora: agendarMatch[3].trim(),
      } : undefined, payload);
    }

    console.log('[Gemma/WhatsApp] ✅ Respuesta enviada:', finalMessage.substring(0, 50));

  } catch (error) {
    console.error('[Gemma/WhatsApp] Error:', error);
    await sendResponseToChatwoot(
      tenantId, conversationId,
      'Disculpa, estoy teniendo problemas técnicos. ¿Puedes intentar de nuevo?',
      payload
    );
  }
}

/**
 * Ejecuta acciones para WhatsApp (agendar cita, transferir a humano)
 */
async function executeWhatsAppAction(
  action: string,
  context: {
    tenantId: string;
    leadId: string;
    conversationId: string;
    phoneNumber: string;
    services: any[];
  },
  actionData: { servicio: string; fecha: string; hora: string } | undefined,
  originalPayload: ChatwootMessagePayload
) {
  const { tenantId, leadId, conversationId, services, phoneNumber } = context;

  try {
    if (action === 'agendar' && actionData) {
      const service = services.find((s: any) =>
        s.nombre.toLowerCase().includes(actionData.servicio.toLowerCase())
      );

      if (!service) {
        await sendResponseToChatwoot(
          tenantId, conversationId,
          `No encontré el servicio "${actionData.servicio}". ¿Cuál de estos te interesa?\n\n${services.map((s: any) => `• ${s.nombre}`).join('\n')}`,
          originalPayload
        );
        return;
      }

      // Crear la cita
      const fechaHora = await parseWhatsAppDate(actionData.fecha, actionData.hora);
      if (!fechaHora) {
        await sendResponseToChatwoot(
          tenantId, conversationId,
          'No entendí la fecha/hora. ¿Puedes decirme de nuevo? Por ejemplo: "mañana a las 10am"',
          originalPayload
        );
        return;
      }

      const cita = await prisma.cita.create({
        data: {
          tenantId,
          leadId,
          servicioId: service.id,
          tipo: 'servicio',
          titulo: `${service.nombre} - WhatsApp`,
          fechaHora,
          duracion: service.duracionMinutos,
          estado: 'confirmada',
          descripcion: 'Cita agendada vía chatbot WhatsApp',
          origenCita: 'whatsapp',
        }
      });

      const fechaFormateada = fechaHora.toLocaleDateString('es-MX', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
        hour: '2-digit', minute: '2-digit'
      });

      await sendResponseToChatwoot(
        tenantId, conversationId,
        `✅ *¡Cita confirmada!*\n\n📌 *Servicio:* ${service.nombre}\n📅 *Fecha:* ${fechaFormateada}\n⏱ *Duración:* ${service.duracionMinutos} min\n💰 *Precio:* $${service.precio} ${service.moneda}\n\n¡Te esperamos!`,
        originalPayload
      );

      await prisma.chatbotConfig.update({
        where: { tenantId },
        data: { totalCitasAgendadas: { increment: 1 } }
      }).catch(() => {});

    } else if (action === 'transferir') {
      // Notificar y crear tarea urgente
      await sendResponseToChatwoot(
        tenantId, conversationId,
        'Entendido, te transfiero con un asesor. En breve alguien se comunicará contigo. 👋',
        originalPayload
      );

      await prisma.task.create({
        data: {
          tenantId,
          titulo: '📢 Cliente de WhatsApp solicita atención humana',
          descripcion: `Cliente ${phoneNumber} solicitó hablar con un asesor.`,
          tipo: 'llamada',
          fechaVencimiento: new Date(),
          completada: false,
          leadId,
        }
      });

      await prisma.chatbotConfig.update({
        where: { tenantId },
        data: { totalTransferencias: { increment: 1 } }
      }).catch(() => {});
    }
  } catch (error) {
    console.error('[Gemma/WhatsApp] Error ejecutando acción:', error);
  }
}

/**
 * Parsea fecha y hora desde lenguaje natural (usa parseFechaHora de chatbot-engine)
 */
async function parseWhatsAppDate(fecha: string, hora: string): Promise<Date | null> {
  const { parseFechaHora } = await import('@/lib/chatbot-engine');
  return parseFechaHora(fecha, hora);
}

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
  originalPayload: ChatwootMessagePayload
) {
  try {
    const localConversationId = originalPayload.metadata?.localConversationId || conversationId;

    // Crear mensaje local
    const localMessage = await prisma.message.create({
      data: {
        conversationId: localConversationId,
        contenido: message,
        direccion: 'salida',
        canal: 'chatwoot',
        estado: 'enviado'
      }
    }).catch(() => null);

    // Sincronizar con Chatwoot si tenemos el ID local
    if (localMessage) {
      await syncOutgoingChatwootMessage({
        tenantId: tenantId as string,
        conversationId: localConversationId,
        content: message,
        messageId: localMessage.id
      }).catch(err => console.error('[Gemma] Error sync outgoing:', err));
    }

    console.log(`[Gemma] Respuesta enviada a conversación ${conversationId}`);
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