import { prisma } from '@/lib/db';
import { processChatbotMessage } from '@/lib/ai/chatbot-processor';
import { chatwootApi } from '@/lib/nexus/chatwoot-api';
import { isModuleActive } from '@/lib/plans';
import { eventBus, EVENTS } from './event-bus';

/**
 * Skill para orquestar la respuesta del chatbot via Chatwoot
 */
export async function executeChatbotResponse(payload: {
  tenantId: string;
  messageId: string;
  conversationId: string | number;
  content: string;
  channel: string;
  metadata?: any;
}) {
  const { tenantId, conversationId, content, channel, metadata } = payload;

  console.log(`[🤖 ChatbotSkill] Procesando mensaje para tenant: ${tenantId}, canal: ${channel}`);

  try {
    console.log(`[🤖 ChatbotSkill] 1. Verificando suscripción para tenant: ${tenantId}`);
    // 1. Verificar si el servicio está contratado (Module Check)
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      include: { tenantFeatures: true }
    });

    if (!tenant) return { success: false, error: 'Tenant no encontrado' };

    const isChatbotHired = isModuleActive('chatbot_whatsapp', tenant.plan, tenant.tenantFeatures);
    if (!isChatbotHired) {
      console.log(`[🤖 ChatbotSkill] El servicio de Chatbot no está contratado para el tenant: ${tenantId}`);
      return { success: false, error: 'Servicio no contratado' };
    }

    // 2. Obtener configuración del chatbot
    const config = await prisma.chatbotConfig.findUnique({
      where: { tenantId }
    });

    if (!config || !config.activo) {
      console.log(`[🤖 ChatbotSkill] Chatbot desactivado para el tenant: ${tenantId}`);
      return { success: false, error: 'Chatbot desactivado' };
    }

    // 3. Evitar bucles (no responder a mensajes del propio bot)
    if (metadata?.message_type === 'outgoing' || metadata?.sender_type === 'bot') {
      return { success: true, ignored: true, reason: 'Mensaje saliente o de bot' };
    }

    // 4. Procesar con IA
    // TODO: Recuperar historial de la conversación si es posible
    const aiResult = await processChatbotMessage(tenantId, content);

    if (!aiResult.success) {
      return { success: false, error: aiResult.error };
    }

    // 5. Enviar respuesta según el canal
    if (channel === 'chatwoot') {
      const accountId = metadata?.accountId || (config as any).credenciales?.accountId;
      const accountToken = metadata?.accountToken || (config as any).credenciales?.accountToken;

      if (!accountId) {
        console.error(`[🤖 ChatbotSkill] No se encontró Account ID para enviar respuesta a Chatwoot`);
        return { success: false, error: 'Falta Account ID' };
      }

      await chatwootApi.sendMessage(
        Number(accountId),
        Number(conversationId),
        aiResult.response,
        accountToken, // Si es nulo, usará el super admin token del cliente
        { messageType: 'outgoing' }
      );
      
      console.log(`[🤖 ChatbotSkill] Respuesta enviada satisfactoriamente a Chatwoot`);
    }

    return { success: true, response: aiResult.response };

  } catch (error) {
    console.error(`[🤖 ChatbotSkill] Error fatal:`, error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}
