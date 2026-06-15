import { processMessage, isWithinBusinessHours, getChatbotConfig } from '@/lib/chat/chatbot-service'

export interface ChatbotResponse {
  success: boolean
  response: string
  fueraHorario?: boolean
  error?: string
}

export async function processChatbotMessage(
  tenantId: string,
  message: string,
  _history: { role: 'user' | 'assistant' | 'system'; content: string }[] = []
): Promise<ChatbotResponse> {
  const result = await processMessage({
    tenantId,
    message,
    channel: 'web',
    metadata: { _history },
  })

  if (!result.success) {
    return { success: false, response: result.response, error: result.error }
  }

  return {
    success: true,
    response: result.response,
    fueraHorario: result.fueraHorario,
  }
}

export { isWithinBusinessHours, getChatbotConfig }
