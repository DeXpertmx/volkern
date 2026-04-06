/**
 * Volkern Integration Handler
 * Capa centralizada para webhooks entrantes
 * 
 * Arquitectura:
 * External System → Webhook → IntegrationHandler → Skills → Core → EventBus
 * 
 * Soporta:
 * - n8n webhooks
 * - Chatwoot webhooks
 * - Webhooks genéricos
 * - Cal.com webhooks
 * - Evolution API webhooks
 */

import { eventBus, EVENTS } from '@/lib/skills/event-bus';
import { executeSkill } from '@/lib/skills';
import crypto from 'crypto';

// ============== TIPOS ==============

export type IntegrationType = 
  | 'n8n'
  | 'chatwoot'
  | 'calcom'
  | 'evolution'
  | 'whatsapp'
  | 'telegram'
  | 'gocardless'
  | 'generic';

export interface WebhookPayload {
  type: IntegrationType;
  event: string;
  data: Record<string, unknown>;
  timestamp?: string;
  signature?: string;
}

export interface WebhookResult {
  success: boolean;
  processed: boolean;
  eventEmitted?: string;
  skillExecuted?: string;
  error?: string;
}

export interface IntegrationConfig {
  tenantId: string;
  type: IntegrationType;
  webhookSecret?: string;
  enabled: boolean;
  mappings?: Record<string, string>; // event -> skill mapping
}

// ============== MAPEOS DE EVENTOS ==============

/**
 * Mapeo de eventos de integraciones externas a skills de Volkern
 */
const INTEGRATION_MAPPINGS: Record<IntegrationType, Record<string, {
  skill?: string;
  event?: string;
  transform: (data: Record<string, unknown>, tenantId: string) => Record<string, unknown>;
}>> = {
  // n8n Workflows
  n8n: {
    'workflow.completed': {
      event: EVENTS.WORKFLOW_EXECUTED,
      transform: (data, tenantId) => ({
        tenantId,
        workflowId: data.workflowId,
        workflowName: data.workflowName,
        executionId: data.executionId,
        result: data.result || data.output,
        source: 'webhook' as const,
        timestamp: new Date(),
      }),
    },
    'workflow.failed': {
      event: EVENTS.WORKFLOW_FAILED,
      transform: (data, tenantId) => ({
        tenantId,
        workflowId: data.workflowId,
        workflowName: data.workflowName,
        executionId: data.executionId,
        error: data.error || data.message,
        source: 'webhook' as const,
        timestamp: new Date(),
      }),
    },
    'lead.enriched': {
      skill: 'update_contact',
      transform: (data, tenantId) => ({
        tenantId,
        contactId: data.leadId || data.contactId,
        ...(typeof data.enrichedData === 'object' && data.enrichedData !== null 
          ? data.enrichedData as Record<string, unknown> 
          : {}),
        source: 'webhook' as const,
      }),
    },
  },

  // Chatwoot
  chatwoot: {
    'conversation.created': {
      skill: 'create_conversation',
      transform: (data, tenantId) => ({
        tenantId,
        canal: 'whatsapp',
        externalId: data.id,
        contactoNombre: (data.contact as Record<string, unknown>)?.name || 'Desconocido',
        source: 'webhook' as const,
      }),
    },
    'message.created': {
      skill: 'sync_chatwoot_incoming',
      transform: (data, tenantId) => ({
        tenantId,
        messageId: data.id as string,
        conversationId: data.conversation_id,
        content: data.content,
        canal: 'chatwoot',
        metadata: {
          accountId: (data.account as any)?.id,
          inboxId: (data.inbox as any)?.id,
          message_type: data.message_type,
          sender_type: (data.sender as any)?.type,
          sender_name: (data.sender as any)?.name,
        }
      }),
    },
    'contact.created': {
      skill: 'create_lead',
      transform: (data, tenantId) => ({
        tenantId,
        nombre: data.name || 'Sin nombre',
        email: data.email || `${data.phone}@chatwoot.local`,
        telefono: data.phone,
        fuente: 'chatwoot',
        source: 'webhook' as const,
      }),
    },
  },

  // Cal.com
  calcom: {
    'booking.created': {
      skill: 'create_booking',
      transform: (data, tenantId) => ({
        tenantId,
        nombre: (data.attendees as Array<Record<string, unknown>>)?.[0]?.name || 'Invitado',
        email: (data.attendees as Array<Record<string, unknown>>)?.[0]?.email || '',
        titulo: data.title || 'Reserva Cal.com',
        fechaHora: data.startTime,
        duracion: data.length || 30,
        descripcion: data.description,
        externalId: data.uid,
        source: 'webhook' as const,
      }),
    },
    'booking.cancelled': {
      skill: 'cancel_booking',
      transform: (data, tenantId) => ({
        tenantId,
        externalId: data.uid,
        motivo: data.cancellationReason || 'Cancelado desde Cal.com',
        source: 'webhook' as const,
      }),
    },
    'booking.rescheduled': {
      event: EVENTS.BOOKING_CREATED, // Re-emitir como nueva reserva
      transform: (data, tenantId) => ({
        tenantId,
        bookingId: data.uid,
        leadId: data.leadId,
        fechaHora: data.startTime,
        titulo: data.title,
        source: 'webhook' as const,
        timestamp: new Date(),
      }),
    },
  },

  // Evolution API (WhatsApp)
  evolution: {
    'message.received': {
      event: EVENTS.MESSAGE_RECEIVED,
      transform: (data, tenantId) => ({
        tenantId,
        messageId: (data.key as Record<string, unknown>)?.id as string || crypto.randomUUID(),
        conversationId: (data.key as Record<string, unknown>)?.remoteJid as string,
        contenido: (data.message as Record<string, unknown>)?.conversation || 
                   ((data.message as Record<string, unknown>)?.extendedTextMessage as Record<string, unknown>)?.text || '',
        canal: 'whatsapp',
        telefono: (data.key as Record<string, unknown>)?.remoteJid,
        source: 'webhook' as const,
        timestamp: new Date(),
      }),
    },
    'connection.update': {
      // Solo log, no acción
      transform: (data, tenantId) => ({ tenantId, ...data }),
    },
  },

  // WhatsApp Business API
  whatsapp: {
    'message': {
      event: EVENTS.MESSAGE_RECEIVED,
      transform: (data, tenantId) => {
        const entry = (data.entry as Array<Record<string, unknown>>)?.[0];
        const changes = (entry?.changes as Array<Record<string, unknown>>)?.[0];
        const value = changes?.value as Record<string, unknown>;
        const messages = (value?.messages as Array<Record<string, unknown>>)?.[0];
        
        return {
          tenantId,
          messageId: messages?.id as string || crypto.randomUUID(),
          conversationId: messages?.from as string,
          contenido: (messages?.text as Record<string, unknown>)?.body || '',
          canal: 'whatsapp',
          telefono: messages?.from,
          source: 'webhook' as const,
          timestamp: new Date(),
        };
      },
    },
  },

  // Telegram
  telegram: {
    'message': {
      event: EVENTS.MESSAGE_RECEIVED,
      transform: (data, tenantId) => {
        const message = data.message as Record<string, unknown>;
        const chat = message?.chat as Record<string, unknown>;
        const from = message?.from as Record<string, unknown>;
        
        return {
          tenantId,
          messageId: String(message?.message_id || crypto.randomUUID()),
          conversationId: String(chat?.id || ''),
          contenido: message?.text as string || '',
          canal: 'telegram',
          telegramChatId: chat?.id,
          nombreRemitente: `${from?.first_name || ''} ${from?.last_name || ''}`.trim(),
          source: 'webhook' as const,
          timestamp: new Date(),
        };
      },
    },
  },

  // Webhook genérico
  generic: {
    'lead.create': {
      skill: 'create_lead',
      transform: (data, tenantId) => ({
        tenantId,
        nombre: data.name || data.nombre,
        email: data.email,
        telefono: data.phone || data.telefono,
        fuente: data.source || 'webhook',
        source: 'webhook' as const,
      }),
    },
    'contact.create': {
      skill: 'create_contact',
      transform: (data, tenantId) => ({
        tenantId,
        nombre: data.name || data.nombre,
        email: data.email,
        telefono: data.phone || data.telefono,
        source: 'webhook' as const,
      }),
    },
    'booking.create': {
      skill: 'create_booking',
      transform: (data, tenantId) => ({
        tenantId,
        nombre: data.clientName || data.nombre,
        email: data.clientEmail || data.email,
        titulo: data.title || data.titulo,
        fechaHora: data.dateTime || data.fechaHora,
        duracion: data.duration || data.duracion || 60,
        source: 'webhook' as const,
      }),
    },
    'task.create': {
      skill: 'create_task',
      transform: (data, tenantId) => ({
        tenantId,
        leadId: data.leadId,
        titulo: data.title || data.titulo,
        descripcion: data.description || data.descripcion,
        tipo: data.type || data.tipo || 'seguimiento',
        source: 'webhook' as const,
      }),
    },
  },

  // GoCardless
  gocardless: {
    'payments.created': {
      event: EVENTS.PAYMENT_RECEIVED,
      transform: (data, tenantId) => ({
        tenantId,
        externalId: data.id,
        amount: Number(data.amount) / 100,
        currency: data.currency,
        status: 'pending',
        source: 'gocardless',
        timestamp: new Date(),
      }),
    },
    'payments.confirmed': {
      event: EVENTS.PAYMENT_RECEIVED,
      transform: (data, tenantId) => ({
        tenantId,
        externalId: data.id,
        amount: Number(data.amount) / 100,
        currency: data.currency,
        status: 'completed',
        source: 'gocardless',
        timestamp: new Date(),
      }),
    },
    'payments.failed': {
      event: EVENTS.PAYMENT_FAILED,
      transform: (data, tenantId) => ({
        tenantId,
        externalId: data.id,
        amount: Number(data.amount) / 100,
        error: data.cause || 'Pago fallido',
        source: 'gocardless',
        timestamp: new Date(),
      }),
    },
    'mandates.active': {
      event: EVENTS.LEAD_UPDATED,
      transform: (data, tenantId) => ({
        tenantId,
        leadId: (data.metadata as any)?.leadId,
        contactId: (data.metadata as any)?.contactId,
        gocardlessMandateId: data.id,
        source: 'gocardless',
      }),
    },
  },
};

// ============== VALIDACIÓN DE FIRMA ==============

/**
 * Valida la firma HMAC de un webhook
 */
export function validateWebhookSignature(
  payload: string,
  signature: string,
  secret: string,
  algorithm: 'sha256' | 'sha1' = 'sha256'
): boolean {
  const hmac = crypto.createHmac(algorithm, secret);
  hmac.update(payload);
  const expectedSignature = hmac.digest('hex');
  
  // Comparación segura contra timing attacks
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature) as any,
      Buffer.from(expectedSignature) as any
    );
  } catch {
    // Si las longitudes son diferentes, timingSafeEqual lanza error
    return false;
  }
}

// ============== HANDLER PRINCIPAL ==============

/**
 * Procesa un webhook entrante
 */
export async function handleIncomingWebhook(
  type: IntegrationType,
  event: string,
  data: Record<string, unknown>,
  tenantId: string,
  options?: {
    signature?: string;
    rawBody?: string;
    webhookSecret?: string;
  }
): Promise<WebhookResult> {
  console.log(`[🔗 Integration] Procesando webhook: ${type}/${event}`, {
    tenantId,
    hasSignature: !!options?.signature,
  });

  // 1. Validar firma si se proporciona
  if (options?.signature && options?.webhookSecret && options?.rawBody) {
    const isValid = validateWebhookSignature(
      options.rawBody,
      options.signature,
      options.webhookSecret
    );
    
    if (!isValid) {
      console.warn(`[🔗 Integration] Firma inválida para webhook ${type}/${event}`);
      return {
        success: false,
        processed: false,
        error: 'Firma inválida',
      };
    }
  }

  // 2. Buscar mapeo
  const integrationMappings = INTEGRATION_MAPPINGS[type];
  if (!integrationMappings) {
    console.warn(`[🔗 Integration] Tipo de integración desconocido: ${type}`);
    return {
      success: false,
      processed: false,
      error: `Tipo de integración no soportado: ${type}`,
    };
  }

  const mapping = integrationMappings[event];
  if (!mapping) {
    console.log(`[🔗 Integration] Evento no mapeado: ${type}/${event}`);
    // Log el webhook para debugging pero no es un error
    await logWebhook(tenantId, type, event, data, 'ignored');
    return {
      success: true,
      processed: false,
      error: `Evento ${event} no tiene mapeo configurado`,
    };
  }

  // 3. Transformar datos
  const transformedData = mapping.transform(data, tenantId);

  // 4. Ejecutar skill o emitir evento
  try {
    if (mapping.skill) {
      // Ejecutar skill
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await executeSkill(mapping.skill as any, transformedData);
      
      await logWebhook(tenantId, type, event, data, 'processed', mapping.skill);
      
      console.log(`[🔗 Integration] Skill ejecutado: ${mapping.skill}`, { tenantId });
      
      return {
        success: true,
        processed: true,
        skillExecuted: mapping.skill,
      };
    }

    if (mapping.event) {
      // Emitir evento al EventBus
      eventBus.emitEvent(mapping.event as any, transformedData as any);
      
      await logWebhook(tenantId, type, event, data, 'processed', undefined, mapping.event);
      
      console.log(`[🔗 Integration] Evento emitido: ${mapping.event}`, { tenantId });
      
      return {
        success: true,
        processed: true,
        eventEmitted: mapping.event,
      };
    }

    // Sin skill ni evento (solo transformación)
    await logWebhook(tenantId, type, event, data, 'processed');
    
    return {
      success: true,
      processed: true,
    };
  } catch (error) {
    console.error(`[🔗 Integration] Error procesando webhook:`, error);
    
    await logWebhook(tenantId, type, event, data, 'error', undefined, undefined, 
      error instanceof Error ? error.message : 'Error desconocido'
    );
    
    return {
      success: false,
      processed: false,
      error: error instanceof Error ? error.message : 'Error procesando webhook',
    };
  }
}

// ============== LOGGING ==============

/**
 * Registra un webhook recibido para auditoría
 * Nota: Usa console.log en lugar de AuditLog porque no tenemos userId en contexto de webhook
 */
async function logWebhook(
  tenantId: string,
  type: IntegrationType,
  event: string,
  data: Record<string, unknown>,
  status: 'processed' | 'ignored' | 'error',
  skillExecuted?: string,
  eventEmitted?: string,
  errorMessage?: string
): Promise<void> {
  const logEntry = {
    timestamp: new Date().toISOString(),
    tenantId,
    type,
    event,
    status,
    skillExecuted,
    eventEmitted,
    errorMessage,
    dataSnapshot: JSON.stringify(data).slice(0, 500),
  };

  if (status === 'error') {
    console.error('[🔗 Integration] Webhook error:', logEntry);
  } else if (status === 'ignored') {
    console.log('[🔗 Integration] Webhook ignored:', logEntry);
  } else {
    console.log('[🔗 Integration] Webhook processed:', logEntry);
  }
}

// ============== UTILIDADES ==============

/**
 * Lista las integraciones disponibles y sus eventos soportados
 */
export function listIntegrations(): Record<IntegrationType, string[]> {
  const result: Record<string, string[]> = {};
  
  for (const [type, mappings] of Object.entries(INTEGRATION_MAPPINGS)) {
    result[type] = Object.keys(mappings);
  }
  
  return result as Record<IntegrationType, string[]>;
}

/**
 * Obtiene la documentación de una integración
 */
export function getIntegrationDocs(type: IntegrationType): {
  type: IntegrationType;
  events: Array<{
    event: string;
    skill?: string;
    eventEmitted?: string;
  }>;
} | null {
  const mappings = INTEGRATION_MAPPINGS[type];
  if (!mappings) return null;
  
  return {
    type,
    events: Object.entries(mappings).map(([event, config]) => ({
      event,
      skill: config.skill,
      eventEmitted: config.event,
    })),
  };
}
