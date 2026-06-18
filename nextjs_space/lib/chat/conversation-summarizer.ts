/**
 * ConversationSummarizer - Resumen automático de conversaciones
 *
 * Cuando una conversación supera un umbral de mensajes,
 * resume los más antiguos para mantener el contexto manejable
 * sin perder información relevante.
 *
 * El resumen se almacena en hubMetadata.chatbotContext.summary
 * y se inyecta al inicio del prompt en lugar de mensajes individuales.
 */

import { callAssistantWithFallback, OpenRouterMessage } from '@/lib/assistant/openrouter-client'

export interface ConversationSummary {
  /** Resumen ejecutivo de la conversación */
  text: string
  /** Temas clave mencionados */
  topics: string[]
  /** Preferencias o decisiones tomadas */
  decisions: string[]
  /** Datos del cliente extraídos */
  customerInfo: Record<string, string>
  /** Timestamp del resumen */
  timestamp: number
  /** Cuántos mensajes fueron resumidos */
  summarizedMessages: number
  /** Versión del formato de resumen */
  version: 2
}

const SUMMARY_THRESHOLD = 12 // Mensajes antes de generar resumen
const MIN_MESSAGES_FOR_SUMMARY = 6 // Mínimo para valer la pena resumir

/**
 * Determina si una conversación necesita ser resumida
 */
export function needsSummarization(
  messageCount: number,
  existingSummaryVersion?: number
): boolean {
  // Si ya hay un resumen v2, no resumir hasta duplicar el umbral
  const effectiveThreshold = existingSummaryVersion === 2
    ? SUMMARY_THRESHOLD * 2
    : SUMMARY_THRESHOLD

  return messageCount >= effectiveThreshold
}

/**
 * Genera un resumen estructurado de los mensajes antiguos
 * usando DeepSeek V4 Flash para análisis semántico.
 */
export async function generateSummary(
  messages: Array<{ role: string; content: string }>,
  existingSummary?: ConversationSummary | null
): Promise<ConversationSummary> {
  const messagesToSummarize = messages.slice(0, -4) // Dejar los últimos 4 mensajes sin resumir

  if (messagesToSummarize.length < MIN_MESSAGES_FOR_SUMMARY) {
    // No hay suficientes mensajes para un resumen útil
    return {
      text: existingSummary?.text || '',
      topics: existingSummary?.topics || [],
      decisions: existingSummary?.decisions || [],
      customerInfo: existingSummary?.customerInfo || {},
      timestamp: Date.now(),
      summarizedMessages: 0,
      version: 2,
    }
  }

  const historyContext = existingSummary
    ? `Resumen anterior:\n${existingSummary.text}\n\nTemas: ${existingSummary.topics.join(', ')}\nDecisiones: ${existingSummary.decisions.join(', ')}`
    : 'No hay resumen previo.'

  const conversationText = messagesToSummarize
    .map(m => `${m.role === 'user' ? '👤 Cliente' : '🤖 Asistente'}: ${m.content}`)
    .join('\n')

  const systemPrompt = `Eres un extractor de información conversacional. Analiza la conversación y genera un resumen estructurado en JSON.

HISTORIAL PREVIO:
${historyContext}

NUEVOS MENSAJES A ANALIZAR:
${conversationText}

Responde EXACTAMENTE con este JSON (sin markdown, sin texto adicional):
{
  "text": "Resumen ejecutivo en 2-3 oraciones de lo ocurrido en TODA la conversación (incluyendo resumen anterior + mensajes nuevos)",
  "topics": ["tema1", "tema2"],
  "decisions": ["decisión tomada 1", "acuerdo 2"],
  "customerInfo": { "clave": "valor" }
}

REGLAS:
- text: Incluye información del resumen anterior + mensajes nuevos. Sé conciso pero informativo.
- topics: Extrae SOLO temas nuevos que no estén ya en el resumen anterior. Máximo 5.
- decisions: Incluye decisiones/acciones acordadas. Combínalas con las del resumen anterior si aplica.
- customerInfo: Extrae SOLO datos factuales del cliente: nombre, email, teléfono, empresa, intereses, problemas reportados, preferencias. NO incluyas información del resumen anterior a menos que haya sido confirmada/repetida en los mensajes nuevos. Mantén SOLO la información más actualizada.`

  try {
    const messages: OpenRouterMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: 'Genera el resumen estructurado de la conversación.' },
    ]

    const response = await callAssistantWithFallback(messages)
    const content = response.choices?.[0]?.message?.content || ''

    // Extraer JSON de la respuesta
    const jsonMatch = content.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      throw new Error('No se encontró JSON en la respuesta')
    }

    const parsed = JSON.parse(jsonMatch[0])

    // Merge con resumen anterior si existe
    const mergedTopics = existingSummary
      ? [...new Set([...existingSummary.topics, ...(parsed.topics || [])])]
      : (parsed.topics || [])

    const mergedDecisions = existingSummary
      ? [...new Set([...existingSummary.decisions, ...(parsed.decisions || [])])]
      : (parsed.decisions || [])

    const mergedCustomerInfo = existingSummary
      ? { ...existingSummary.customerInfo, ...(parsed.customerInfo || {}) }
      : (parsed.customerInfo || {})

    // Construir texto combinado
    const combinedText = existingSummary
      ? `${existingSummary.text}\n\n📌 Desde entonces:\n${parsed.text || ''}`
      : (parsed.text || '')

    return {
      text: combinedText,
      topics: mergedTopics.slice(0, 8),
      decisions: mergedDecisions.slice(0, 8),
      customerInfo: mergedCustomerInfo,
      timestamp: Date.now(),
      summarizedMessages: messagesToSummarize.length,
      version: 2,
    }
  } catch (error) {
    console.error('[ConversationSummarizer] Error generando resumen:', error)

    // Fallback: resumen básico con fechas
    if (messagesToSummarize.length > 0) {
      const firstMsg = messagesToSummarize[0]
      const lastMsg = messagesToSummarize[messagesToSummarize.length - 1]
      return {
        text: `Conversación del ${new Date().toLocaleDateString()} con ${messagesToSummarize.length} mensajes. Último tema: "${(lastMsg?.content || '').substring(0, 100)}..."`,
        topics: ['conversación general'],
        decisions: [],
        customerInfo: existingSummary?.customerInfo || {},
        timestamp: Date.now(),
        summarizedMessages: messagesToSummarize.length,
        version: 2,
      }
    }

    return {
      text: existingSummary?.text || '',
      topics: existingSummary?.topics || [],
      decisions: existingSummary?.decisions || [],
      customerInfo: existingSummary?.customerInfo || {},
      timestamp: Date.now(),
      summarizedMessages: 0,
      version: 2,
    }
  }
}

/**
 * Construye el bloque de resumen para el prompt del LLM
 */
export function buildSummaryBlock(summary: ConversationSummary | null): string {
  if (!summary || !summary.text) return ''

  const parts: string[] = []
  parts.push('=== RESUMEN DE LA CONVERSACIÓN ===')
  parts.push(summary.text)

  if (summary.decisions.length > 0) {
    parts.push('')
    parts.push('Decisiones/Acciones:')
    summary.decisions.forEach(d => parts.push(`- ${d}`))
  }

  if (Object.keys(summary.customerInfo).length > 0) {
    parts.push('')
    parts.push('Datos del cliente:')
    Object.entries(summary.customerInfo).forEach(([k, v]) => parts.push(`- ${k}: ${v}`))
  }

  if (summary.topics.length > 0) {
    parts.push('')
    parts.push('Temas cubiertos: ' + summary.topics.join(', '))
  }

  parts.push('=== FIN DEL RESUMEN ===')
  return parts.join('\n')
}
