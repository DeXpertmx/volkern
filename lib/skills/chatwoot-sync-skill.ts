import { prisma } from '@/lib/db';
import { eventBus, EVENTS } from './event-bus';
import { chatwootApi } from '@/lib/nexus/chatwoot-api';

/**
 * Sincroniza un mensaje entrante desde Chatwoot hacia el CRM local
 */
export async function syncIncomingChatwootMessage(payload: {
  tenantId: string;
  messageId: string | number;
  conversationId: string | number;
  content: string;
  canal: string;
  metadata?: any;
}) {
  const { tenantId, messageId, conversationId, content, canal, metadata } = payload;

  console.log(`[🔄 ChatwootSync] Sincronizando mensaje entrante: ${messageId} en conversación ${conversationId}`);

  try {
    // 1. Buscar o crear la conversación localmente
    // Usamos externalRef para mapear el ID de conversación de Chatwoot
    const externalRef = `chatwoot_${conversationId}`;
    
    let conversation = await prisma.conversation.findUnique({
      where: { externalRef }
    });

    if (!conversation) {
      console.log(`[🔄 ChatwootSync] Creando nueva conversación local para externalRef: ${externalRef}`);
      
      // Intentar encontrar un lead relacionado por el contacto de Chatwoot si viniera en el metadata
      // Por ahora creamos una básica
      conversation = await prisma.conversation.create({
        data: {
          tenantId,
          contactoNombre: metadata?.sender_name || 'Usuario Chatwoot',
          canal: 'chatwoot',
          externalRef,
          chatwootAccountId: metadata?.accountId,
          chatwootInboxId: metadata?.inboxId,
          estado: 'abierta',
        }
      });
    }

    // 2. Verificar si el mensaje ya existe (evitar duplicados de webhooks repetidos)
    const existingMessage = await prisma.message.findUnique({
      where: { externalRef: `chatwoot_msg_${messageId}` }
    });

    if (existingMessage) {
      console.log(`[🔄 ChatwootSync] El mensaje ${messageId} ya está sincronizado. Ignorando.`);
      return { success: true, messageId: existingMessage.id, alreadySynced: true };
    }

    // 3. Guardar el mensaje localmente
    const message = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        contenido: content,
        direccion: metadata?.sender_type === 'contact' ? 'entrada' : 'salida',
        canal: 'chatwoot',
        externalRef: `chatwoot_msg_${messageId}`,
        chatwootMessageId: typeof messageId === 'number' ? messageId : undefined,
        metadatos: metadata ? JSON.parse(JSON.stringify(metadata)) : undefined,
      }
    });

    // 4. Actualizar puntero de último mensaje en la conversación
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: {
        ultimoMensaje: content.substring(0, 100),
        fechaUltimoMensaje: new Date(),
        noLeidos: metadata?.sender_type === 'contact' ? { increment: 1 } : undefined,
      }
    });

    console.log(`[🔄 ChatwootSync] Mensaje sincronizado exitosamente: ${message.id}`);

    // 5. Emitir evento para que otros sistemas (como el chatbot) actúen
    if (metadata?.sender_type === 'contact') {
      eventBus.emitEvent(EVENTS.MESSAGE_RECEIVED, {
        tenantId,
        messageId: String(messageId),
        conversationId: String(conversationId),
        content,
        canal: 'chatwoot',
        source: 'webhook',
        timestamp: new Date(),
        metadata: {
          ...metadata,
          localConversationId: conversation.id,
          localMessageId: message.id
        }
      });
    }

    return { success: true, messageId: message.id };
  } catch (error) {
    console.error('[🔄 ChatwootSync] Error sincronizando mensaje entrante:', error);
    throw error;
  }
}

/**
 * Sincroniza un mensaje saliente del CRM hacia Chatwoot
 */
export async function syncOutgoingChatwootMessage(payload: {
  tenantId: string;
  conversationId: string;
  content: string;
  messageId: string;
}) {
  const { tenantId, conversationId, content, messageId } = payload;

  try {
    // 1. Obtener la conversación para sacar los IDs de Chatwoot
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      include: { tenant: true }
    });

    if (!conversation || !conversation.chatwootAccountId || !conversation.externalRef) {
      // No es una conversación de Chatwoot o no tiene los IDs necesarios
      return { success: false, reason: 'No es una conversación vinculada a Chatwoot' };
    }

    // Extraer ID de conversación de Chatwoot del externalRef (format: chatwoot_{id})
    const chatwootConversationId = parseInt(conversation.externalRef.replace('chatwoot_', ''));
    
    // 2. Buscar integración de Chatwoot para obtener el token
    const integration = await prisma.integration.findFirst({
      where: { 
        tenantId, 
        tipo: 'chatwoot', 
        activo: true 
      }
    });

    if (!integration || !integration.configuracion) {
        return { success: false, reason: 'Integración de Chatwoot no configurada o inactiva' };
    }

    const config = integration.configuracion as any;
    const accountToken = config.accountToken || config.accessToken;

    if (!accountToken) {
        return { success: false, reason: 'Token de Chatwoot no encontrado en la configuración' };
    }

    console.log(`[🔄 ChatwootSync] Enviando respuesta a Chatwoot: Conv ${chatwootConversationId}`);

    // 3. Enviar mensaje a la API de Chatwoot
    const response = await chatwootApi.sendMessage(
      conversation.chatwootAccountId,
      chatwootConversationId,
      content,
      accountToken,
      { messageType: 'outgoing' }
    );

    // 4. Actualizar el mensaje local con el ID de Chatwoot
    await prisma.message.update({
      where: { id: messageId },
      data: {
        chatwootMessageId: response.id,
        externalRef: `chatwoot_msg_${response.id}`,
        estado: 'enviado'
      }
    });

    return { success: true, chatwootMessageId: response.id };
  } catch (error) {
    console.error('[🔄 ChatwootSync] Error sincronizando mensaje saliente:', error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}
