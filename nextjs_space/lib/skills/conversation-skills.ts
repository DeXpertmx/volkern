/**
 * Conversation Skills
 * API funcional para gestión de conversaciones y mensajes
 * 
 * Arquitectura:
 * App/Agent/Automation → Skill → Core (Prisma) → EventBus
 */

import { prisma } from '@/lib/db';
import { eventBus, EVENTS } from './event-bus';
import type { ConversationCreatedEvent, MessageSentEvent } from '@/lib/types/events';

// ============== TIPOS ==============

export interface CreateConversationInput {
  tenantId: string;
  contactoNombre: string;
  contactoEmail?: string;
  contactoTelefono?: string;
  canal: 'whatsapp' | 'telegram' | 'email' | 'web' | 'facebook' | 'instagram';
  leadId?: string;
  estudianteId?: string;
  chatwootAccountId?: number;
  chatwootInboxId?: number;
  externalRef?: string;
  // Metadata
  userId?: string;
  source?: 'api' | 'app' | 'automation' | 'mcp' | 'webhook';
}

export interface SendMessageInput {
  tenantId: string;
  conversationId: string;
  contenido: string;
  canal: string;
  direccion?: 'entrada' | 'salida';
  metadatos?: Record<string, unknown>;
  // Metadata
  userId?: string;
  source?: 'api' | 'app' | 'automation' | 'mcp' | 'webhook';
}

export interface CloseConversationInput {
  conversationId: string;
  tenantId: string;
  userId?: string;
  source?: 'api' | 'app' | 'automation' | 'mcp' | 'webhook';
}

// ============== SKILLS ==============

/**
 * Crear una nueva conversación
 */
export async function createConversation(input: CreateConversationInput) {
  const {
    tenantId,
    contactoNombre,
    contactoEmail,
    contactoTelefono,
    canal,
    leadId,
    estudianteId,
    chatwootAccountId,
    chatwootInboxId,
    externalRef,
    userId,
    source = 'app',
  } = input;

  // 1. Validación
  if (!tenantId) throw new Error('tenantId es requerido');
  if (!contactoNombre) throw new Error('contactoNombre es requerido');
  if (!canal) throw new Error('canal es requerido');

  // 2. Crear en Core
  const conversation = await prisma.conversation.create({
    data: {
      tenantId,
      contactoNombre,
      contactoEmail,
      contactoTelefono,
      canal,
      leadId,
      estudianteId,
      chatwootAccountId,
      chatwootInboxId,
      externalRef,
      estado: 'abierta',
    },
  });

  // 3. Emitir evento
  const eventPayload: ConversationCreatedEvent = {
    tenantId,
    userId,
    timestamp: new Date(),
    source,
    conversationId: conversation.id,
    contactoNombre,
    canal,
    leadId,
  };
  eventBus.emitEvent(EVENTS.CONVERSATION_CREATED, eventPayload);

  // 4. Retornar resultado
  return conversation;
}

/**
 * Enviar mensaje en una conversación
 */
export async function sendMessage(input: SendMessageInput) {
  const {
    tenantId,
    conversationId,
    contenido,
    canal,
    direccion = 'salida',
    metadatos,
    userId,
    source = 'app',
  } = input;

  // 1. Validación
  if (!tenantId) throw new Error('tenantId es requerido');
  if (!conversationId) throw new Error('conversationId es requerido');
  if (!contenido) throw new Error('contenido es requerido');

  // Verificar conversación existe
  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, tenantId },
  });
  if (!conversation) {
    throw new Error('Conversación no encontrada');
  }

  // 2. Crear mensaje en Core
  const message = await prisma.message.create({
    data: {
      conversationId,
      contenido,
      canal,
      direccion,
      estado: 'enviado',
      metadatos: metadatos ? JSON.parse(JSON.stringify(metadatos)) : undefined,
    },
  });

  // 3. Actualizar conversación
  await prisma.conversation.update({
    where: { id: conversationId },
    data: {
      ultimoMensaje: contenido.substring(0, 100),
      fechaUltimoMensaje: new Date(),
    },
  });

  // 4. Emitir evento
  const eventPayload: MessageSentEvent = {
    tenantId,
    userId,
    timestamp: new Date(),
    source,
    messageId: message.id,
    conversationId,
    contenido,
    canal,
    destinatario: conversation.contactoNombre,
  };
  eventBus.emitEvent(EVENTS.MESSAGE_SENT, eventPayload);

  // 5. Retornar resultado
  return message;
}

/**
 * Cerrar una conversación
 */
export async function closeConversation(input: CloseConversationInput) {
  const { conversationId, tenantId, userId, source = 'app' } = input;

  // 1. Validación
  if (!conversationId) throw new Error('conversationId es requerido');
  if (!tenantId) throw new Error('tenantId es requerido');

  // Verificar conversación existe
  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, tenantId },
  });
  if (!conversation) {
    throw new Error('Conversación no encontrada');
  }

  // 2. Actualizar en Core
  const updatedConversation = await prisma.conversation.update({
    where: { id: conversationId },
    data: { estado: 'cerrada' },
  });

  // 3. Emitir evento
  eventBus.emit(EVENTS.CONVERSATION_CLOSED, {
    tenantId,
    userId,
    timestamp: new Date(),
    source,
    conversationId,
  });

  return updatedConversation;
}

/**
 * Obtener conversación por ID
 */
export async function getConversation(conversationId: string, tenantId: string) {
  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, tenantId },
    include: {
      mensajes: {
        orderBy: { fechaCreacion: 'desc' },
        take: 50,
      },
    },
  });
  return conversation;
}

/**
 * Buscar o crear conversación para un lead
 */
export async function getOrCreateConversation(input: CreateConversationInput) {
  const { tenantId, leadId, canal, contactoNombre } = input;

  if (leadId) {
    // Buscar conversación existente del lead en el mismo canal
    const existing = await prisma.conversation.findFirst({
      where: {
        tenantId,
        leadId,
        canal,
        estado: 'abierta',
      },
    });

    if (existing) {
      return existing;
    }
  }

  // Crear nueva conversación
  return createConversation(input);
}
