/**
 * Motor de Chatbot WhatsApp - Ahora delega en ChatbotService unificado
 */

import { processMessage as unifiedProcess, isWithinBusinessHours, parseFechaHora, getChatbotConfig, updateChatbotConfig } from '@/lib/chat/chatbot-service'
import { sendWhatsAppMessage } from '@/lib/whatsapp'

export async function processChatbotMessage(
  tenantId: string,
  phoneNumber: string,
  messageText: string,
  leadId: string,
  conversationId: string
): Promise<{ success: boolean; response?: string; action?: string; error?: string }> {
  const result = await unifiedProcess({
    tenantId,
    message: messageText,
    channel: 'whatsapp',
    contactPhone: phoneNumber,
    leadId,
    conversationId,
    metadata: { _engine: 'chatbot-engine' },
  })

  if (!result.success) {
    return { success: false, error: result.error }
  }

  if (result.response && phoneNumber) {
    await sendWhatsAppMessage(phoneNumber, result.response, tenantId)
  }

  return {
    success: true,
    response: result.response,
    action: result.action,
  }
}

export { isWithinBusinessHours, parseFechaHora, getChatbotConfig, updateChatbotConfig }
