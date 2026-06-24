/**
 * ConversationAnalyzer - Analítica post-conversación
 *
 * Analiza cada conversación al cerrarse para extraer:
 * - Sentimiento del cliente (positivo/negativo/neutral)
 * - Estado de resolución (¿se resolvió el problema?)
 * - Skills ejecutados y su éxito
 * - Fallbacks activados
 * - Intenciones detectadas
 * - Tiempo de resolución
 *
 * Los resultados se almacenan en chatbotAuditLog para análisis posterior.
 */

import { prisma } from '@/lib/db'
import { callAssistantWithFallback, OpenRouterMessage } from '@/lib/assistant/openrouter-client'

export interface ConversationAnalysis {
  conversationId: string
  tenantId: string
  /** Sentimiento general del cliente en la conversación */
  sentiment: 'positive' | 'negative' | 'neutral' | 'frustrated'
  /** Score de sentimiento 0-100 (100 = muy positivo) */
  sentimentScore: number
  /** ¿Se resolvió la necesidad del cliente? */
  resolved: boolean
  /** Confianza en la evaluación de resolución */
  resolutionConfidence: number
  /** Intenciones detectadas durante la conversación */
  intentsDetected: string[]
  /** Skills ejecutados */
  skillsUsed: string[]
  /** Cuántas veces se activó un fallback */
  fallbackCount: number
  /** Cuántas veces se clasificó como 'unknown' */
  unknownCount: number
  /** Número total de mensajes */
  totalMessages: number
  /** Duración de la conversación en minutos */
  durationMinutes: number
  /** ¿Se requirió transferencia a humano? */
  requiredHumanTransfer: boolean
  /** Temas principales mencionados */
  topics: string[]
  /** Recomendaciones para mejora */
  recommendations: string[]
  /** Timestamp del análisis */
  analyzedAt: Date
}

const MIN_MESSAGES_FOR_ANALYSIS = 4

/**
 * Analiza una conversación completa usando DeepSeek V4 Flash.
 * Se ejecuta cuando la conversación se cierra o alcanza un límite de mensajes.
 */
export async function analyzeConversation(
  conversationId: string,
  tenantId: string,
  messages: Array<{ role: string; content: string; timestamp: Date }>,
  auditLogs: Array<{ intent?: string; skillExecuted?: string; status?: string; errorMessage?: string }>
): Promise<ConversationAnalysis> {
  const startTime = Date.now()

  if (messages.length < MIN_MESSAGES_FOR_ANALYSIS) {
    // Conversaciones muy cortas no ameritan análisis profundo
    return {
      conversationId,
      tenantId,
      sentiment: 'neutral',
      sentimentScore: 50,
      resolved: messages.length > 1,
      resolutionConfidence: 0.3,
      intentsDetected: auditLogs.filter(l => l.intent).map(l => l.intent!).filter(Boolean),
      skillsUsed: auditLogs.filter(l => l.skillExecuted).map(l => l.skillExecuted!).filter(Boolean),
      fallbackCount: auditLogs.filter(l => l.status === 'ERROR').length,
      unknownCount: auditLogs.filter(l => l.intent === 'unknown').length,
      totalMessages: messages.length,
      durationMinutes: calcDuration(messages),
      requiredHumanTransfer: auditLogs.some(l => l.skillExecuted === 'transfer_to_human'),
      topics: [],
      recommendations: [],
      analyzedAt: new Date(),
    }
  }

  const conversationText = messages
    .map(m => `${m.role === 'user' ? '👤 Cliente' : '🤖 Asistente'}: ${m.content}`)
    .join('\n')

  const auditSummary = auditLogs.length > 0
    ? auditLogs.map(l => {
        const parts = []
        if (l.intent) parts.push(`intent:${l.intent}`)
        if (l.skillExecuted) parts.push(`skill:${l.skillExecuted}`)
        if (l.status) parts.push(`status:${l.status}`)
        if (l.errorMessage) parts.push(`error:${l.errorMessage.substring(0, 80)}`)
        return parts.join(' | ')
      }).join('\n')
    : 'Sin datos de auditoría'

  const systemPrompt = `Eres un analizador de conversaciones de atención al cliente. Analiza la conversación y extrae métricas en formato JSON.

CONVERSACIÓN:
${conversationText}

REGISTROS DE AUDITORÍA:
${auditSummary}

Responde EXACTAMENTE con este JSON (sin markdown, sin texto adicional):
{
  "sentiment": "positive|negative|neutral|frustrated",
  "sentimentScore": 0-100,
  "resolved": true|false,
  "resolutionConfidence": 0.0-1.0,
  "topics": ["tema1", "tema2"],
  "recommendations": ["recomendación 1", "recomendación 2"]
}

REGLAS:
- sentiment: Evalúa el tono general del cliente. Usa "frustrated" si hay señales claras de frustración.
- sentimentScore: 0-100 basado en el lenguaje del cliente (0=muy negativo, 100=muy positivo).
- resolved: ¿El cliente obtuvo lo que necesitaba? Considera si hubo agradecimientos, confirmaciones, o si la conversación terminó abruptamente.
- resolutionConfidence: Qué tan seguro estás de tu evaluación de resolución.
- topics: Máximo 5 temas principales mencionados.
- recommendations: Sugerencias para mejorar (ej: "añadir KB sobre X", "mejorar respuesta para Y"). Máximo 3.`

  try {
    const llmMessages: OpenRouterMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: 'Analiza la conversación.' },
    ]

    const response = await callAssistantWithFallback(llmMessages)
    const content = response.choices?.[0]?.message?.content || ''

    const jsonMatch = content.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('No se encontró JSON')

    const parsed = JSON.parse(jsonMatch[0])

    const analysis: ConversationAnalysis = {
      conversationId,
      tenantId,
      sentiment: parsed.sentiment || 'neutral',
      sentimentScore: parsed.sentimentScore ?? 50,
      resolved: parsed.resolved ?? false,
      resolutionConfidence: parsed.resolutionConfidence ?? 0.5,
      intentsDetected: [...new Set(auditLogs.filter(l => l.intent).map(l => l.intent!))],
      skillsUsed: [...new Set(auditLogs.filter(l => l.skillExecuted).map(l => l.skillExecuted!))],
      fallbackCount: auditLogs.filter(l => l.status === 'ERROR').length,
      unknownCount: auditLogs.filter(l => l.intent === 'unknown').length,
      totalMessages: messages.length,
      durationMinutes: calcDuration(messages),
      requiredHumanTransfer: auditLogs.some(l => l.skillExecuted === 'transfer_to_human'),
      topics: (parsed.topics || []).slice(0, 5),
      recommendations: (parsed.recommendations || []).slice(0, 3),
      analyzedAt: new Date(),
    }

    // Guardar análisis en audit log
    await saveAnalysis(analysis)

    const elapsed = Date.now() - startTime
    console.log(`[ConversationAnalyzer] ✅ Análisis completado en ${elapsed}ms | sent=${analysis.sentiment} resolved=${analysis.resolved} msgs=${analysis.totalMessages}`)

    return analysis
  } catch (error) {
    console.error('[ConversationAnalyzer] Error:', error)

    // Fallback: análisis básico sin LLM
    const hasNegatives = messages.some(m =>
      /malo?|pésimo|horrible|queja|error|no funciona|no sirve|devolver|cancelar/i.test(m.content)
    )
    const hasPositives = messages.some(m =>
      /gracias|excelente|perfecto|funcionó|me gustó|genial|buen servicio/i.test(m.content)
    )

    const fallback: ConversationAnalysis = {
      conversationId,
      tenantId,
      sentiment: hasNegatives ? 'negative' : hasPositives ? 'positive' : 'neutral',
      sentimentScore: hasNegatives ? 25 : hasPositives ? 75 : 50,
      resolved: messages.length > 2 && !hasNegatives,
      resolutionConfidence: 0.4,
      intentsDetected: [...new Set(auditLogs.filter(l => l.intent).map(l => l.intent!))],
      skillsUsed: [...new Set(auditLogs.filter(l => l.skillExecuted).map(l => l.skillExecuted!))],
      fallbackCount: auditLogs.filter(l => l.status === 'ERROR').length,
      unknownCount: auditLogs.filter(l => l.intent === 'unknown').length,
      totalMessages: messages.length,
      durationMinutes: calcDuration(messages),
      requiredHumanTransfer: auditLogs.some(l => l.skillExecuted === 'transfer_to_human'),
      topics: [],
      recommendations: [],
      analyzedAt: new Date(),
    }

    await saveAnalysis(fallback)
    return fallback
  }
}

/**
 * Guarda el análisis en chatbotAuditLog para consultas posteriores
 */
async function saveAnalysis(analysis: ConversationAnalysis): Promise<void> {
  try {
    await prisma.chatbotAuditLog.create({
      data: {
        tenantId: analysis.tenantId,
        intent: 'conversation_analysis',
        skillParams: {
          conversationId: analysis.conversationId,
          sentiment: analysis.sentiment,
          sentimentScore: analysis.sentimentScore,
          resolved: analysis.resolved,
          resolutionConfidence: analysis.resolutionConfidence,
          intentsDetected: analysis.intentsDetected,
          skillsUsed: analysis.skillsUsed,
          fallbackCount: analysis.fallbackCount,
          unknownCount: analysis.unknownCount,
          totalMessages: analysis.totalMessages,
          durationMinutes: analysis.durationMinutes,
          requiredHumanTransfer: analysis.requiredHumanTransfer,
          topics: analysis.topics,
          recommendations: analysis.recommendations,
        } as any,
      } as any,
    })
  } catch (error) {
    console.error('[ConversationAnalyzer] Error guardando análisis:', error)
  }
}

/**
 * Calcula la duración de la conversación en minutos
 */
function calcDuration(messages: Array<{ timestamp: Date }>): number {
  if (messages.length < 2) return 0
  const first = messages[0].timestamp.getTime()
  const last = messages[messages.length - 1].timestamp.getTime()
  return Math.round((last - first) / 60000)
}

/**
 * Obtiene análisis recientes para un tenant
 */
export async function getRecentAnalyses(
  tenantId: string,
  hours: number = 24
): Promise<ConversationAnalysis[]> {
  try {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000)
    const logs = await prisma.chatbotAuditLog.findMany({
      where: {
        tenantId,
        intent: 'conversation_analysis',
        createdAt: { gte: since },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    })

    return logs.map(log => ({
      conversationId: (log.skillParams as any)?.conversationId || '',
      tenantId,
      sentiment: (log.skillParams as any)?.sentiment || 'neutral',
      sentimentScore: (log.skillParams as any)?.sentimentScore || 50,
      resolved: (log.skillParams as any)?.resolved ?? false,
      resolutionConfidence: (log.skillParams as any)?.resolutionConfidence || 0,
      intentsDetected: (log.skillParams as any)?.intentsDetected || [],
      skillsUsed: (log.skillParams as any)?.skillsUsed || [],
      fallbackCount: (log.skillParams as any)?.fallbackCount || 0,
      unknownCount: (log.skillParams as any)?.unknownCount || 0,
      totalMessages: (log.skillParams as any)?.totalMessages || 0,
      durationMinutes: (log.skillParams as any)?.durationMinutes || 0,
      requiredHumanTransfer: (log.skillParams as any)?.requiredHumanTransfer || false,
      topics: (log.skillParams as any)?.topics || [],
      recommendations: (log.skillParams as any)?.recommendations || [],
      analyzedAt: log.createdAt,
    }))
  } catch {
    return []
  }
}
