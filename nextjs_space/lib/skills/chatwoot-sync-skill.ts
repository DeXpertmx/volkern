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
    // Preferencia: vínculo por hubMetadata.chatwootConversationId (puente
    // WhatsApp/Evolution guarda el ID de la conversación del hub en la
    // conversación local). Fallback: externalRef chatwoot_{id} (flujo legacy).
    const externalRef = `chatwoot_${conversationId}`;

    let conversation = await prisma.conversation.findFirst({
      where: {
        hubMetadata: { path: ['chatwootConversationId'], equals: Number(conversationId) },
      } as any,
    }).catch(() => null);

    if (!conversation) {
      conversation = await prisma.conversation.findUnique({
        where: { externalRef }
      });
    }

    if (!conversation) {
      console.log(`[🔄 ChatwootSync] Creando nueva conversación local para externalRef: ${externalRef}`);
      
      let leadIdFound: string | undefined = undefined;
      let existingLeadEmail: string | undefined = undefined;

      // Intentar encontrar un lead relacionado si es canal email o telegram
      const senderEmail = metadata?.sender?.email || metadata?.contact?.email;
      
      if (senderEmail && tenantId) {
        console.log(`[🔄 ChatwootSync] Buscando lead por email: ${senderEmail}`);
        const lead = await prisma.lead.findFirst({
          where: { 
            email: senderEmail,
            tenantId: tenantId
          },
          select: { id: true, email: true }
        });

        if (lead) {
          console.log(`[🔄 ChatwootSync] Lead encontrado: ${lead.id}`);
          leadIdFound = lead.id;
          existingLeadEmail = lead.email;
        }
      }
      
      conversation = await prisma.conversation.create({
        data: {
          tenantId,
          leadId: leadIdFound, // Vincular automáticamente si se encontró
          contactoNombre: metadata?.sender_name || metadata?.sender?.name || 'Usuario',
          contactoEmail: existingLeadEmail || senderEmail,
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
        canal: metadata?.channel_type === 'email' ? 'email' : 'chatwoot',
        externalRef: `chatwoot_msg_${messageId}`,
        chatwootMessageId: typeof messageId === 'number' ? messageId : undefined,
        metadatos: metadata ? JSON.parse(JSON.stringify(metadata)) : undefined,
      }
    });

    // 4. Actualizar puntero de último mensaje en la conversación y Score del Lead
    if (metadata?.sender_type === 'contact' && conversation.leadId) {
        // Incrementar score (+10 puntos por interacción de email/mensaje)
        console.log(`[🔄 ChatwootSync] Incrementando score del lead ${conversation.leadId}`);
        await prisma.lead.update({
            where: { id: conversation.leadId },
            data: {
                scoreValue: { increment: 10 },
                fechaUltimaActividad: new Date(),
            }
        });

        // Registrar interacción en el timeline
        await (prisma.interaction.create as any)({
            data: {
                tenantId: tenantId,
                leadId: conversation.leadId,
                tipo: ['email', 'facebook', 'instagram', 'whatsapp', 'telegram'].includes(metadata?.channel_type) ? metadata.channel_type : 'conversacion',
                descripcion: `Mensaje recibido vía ${metadata?.channel_type || 'chatwoot'}: ${content.substring(0, 50)}...`,
                metadata: {
                    messageId: message.id,
                    externalRef: message.externalRef,
                    is_social: ['facebook', 'instagram'].includes(metadata?.channel_type)
                }
            }
        });
    }

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
  contentType?: string;
  contentAttributes?: Record<string, any>;
}) {
  const { tenantId, conversationId, content, messageId, contentType, contentAttributes } = payload;

  try {
    // 1. Obtener la conversación para sacar los IDs de Chatwoot
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      include: { tenant: true }
    });

    if (!conversation) {
      return { success: false, reason: 'Conversación local no encontrada' };
    }

    // ID de la conversación de Chatwoot: primero desde hubMetadata (puente
    // WhatsApp/Evolution), fallback al externalRef legacy (format: chatwoot_{id})
    const chatwootConversationId =
      (conversation.hubMetadata as any)?.chatwootConversationId ||
      (conversation.externalRef?.startsWith('chatwoot_')
        ? parseInt(conversation.externalRef.replace('chatwoot_', ''), 10)
        : undefined);

    if (!conversation.chatwootAccountId || !chatwootConversationId) {
      // No es una conversación de Chatwoot o no tiene los IDs necesarios
      return { success: false, reason: 'No es una conversación vinculada a Chatwoot' };
    }

    // 2. Obtener el token de la cuenta de Chatwoot:
    //    - Canal WhatsApp (config.apiToken): token REAL de agente del tenant
    //      (el token del bot no puede crear mensajes salientes: 401
    //      "not authorized for bots").
    //    - Integración legacy (integration.configuracion.accountToken)
    //    - Hub config moderno (messagingHubConfig → bot user)
    const whatsappChannel = await prisma.channel.findFirst({
      where: { tenantId, type: 'whatsapp', isActive: true },
      select: { config: true },
    });

    let accountToken = '';
    if (whatsappChannel?.config) {
      const config = whatsappChannel.config as any;
      accountToken = config.apiToken || '';
    }

    if (!accountToken) {
      const integration = await prisma.integration.findFirst({
        where: {
          tenantId,
          tipo: 'chatwoot',
          activo: true
        }
      });

      if (integration?.configuracion) {
        const config = integration.configuracion as any;
        accountToken = config.accountToken || config.accessToken || '';
      }
    }

    if (!accountToken) {
      // Flujo moderno: usar el bot user del hub (mismo token que crea los inboxes)
      try {
        const hub = await prisma.messagingHubConfig.findFirst({
          where: { tenantId, chatwootAccountId: conversation.chatwootAccountId },
          select: { hubApiToken: true },
        });
        const rawToken = hub?.hubApiToken;
        if (rawToken) {
          try {
            const { decrypt } = await import('@/lib/core/crypto');
            accountToken = decrypt(rawToken);
          } catch {
            accountToken = rawToken;
          }
        }
        if (!accountToken) {
          const { chatwootApi } = await import('@/lib/nexus/chatwoot-api');
          accountToken = await chatwootApi.ensureBotUserInAccount(conversation.chatwootAccountId);
        }
      } catch (tokenError) {
        return { success: false, reason: 'No se pudo obtener el token de Chatwoot: ' + (tokenError instanceof Error ? tokenError.message : String(tokenError)) };
      }
    }

    if (!accountToken) {
        return { success: false, reason: 'Token de Chatwoot no encontrado en la configuración' };
    }

    console.log(`[🔄 ChatwootSync] Enviando respuesta a Chatwoot: Conv ${chatwootConversationId}`);

    // Convertir el formato interactivo de WhatsApp/Telegram
    // (interactive.action.buttons) al formato input_select de Chatwoot (items).
    // Sin la conversión, Chatwoot devuelve 422 "undefined method 'reject' for
    // nil" y la respuesta del bot nunca llega al hub ni a WhatsApp.
    const rawInteractive = (contentAttributes as any)?.interactive;
    let chatwootContentAttributes: Record<string, any> = contentAttributes || {};
    if (contentType === 'input_select' && rawInteractive?.action?.buttons?.length) {
      chatwootContentAttributes = {
        items: rawInteractive.action.buttons.map((btn: any, i: number) => ({
          title: btn.reply?.title || btn.title || `Opción ${i + 1}`,
          value: btn.reply?.id || btn.id || String(i),
        })),
        ...(rawInteractive.footer?.text ? { shared: rawInteractive.footer.text } : {}),
      };
    }

    // 3. Enviar mensaje a la API de Chatwoot. Se marca volkernOrigin: 'chatbot'
    //    para que el webhook de Chatwoot sepa que este mensaje ya fue/será
    //    entregado por el puente y no lo re-sincronice (evita duplicados).
    const response = await chatwootApi.sendMessage(
      conversation.chatwootAccountId,
      chatwootConversationId,
      content,
      accountToken,
      {
        messageType: 'outgoing',
        ...(contentType && { contentType }),
        contentAttributes: {
          ...chatwootContentAttributes,
          volkernOrigin: 'chatbot',
        },
      }
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
