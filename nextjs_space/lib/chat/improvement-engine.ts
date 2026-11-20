/**
 * ImprovementEngine - Motor de mejora continua automática
 *
 * Basado en patrones detectados por PatternDetector, genera sugerencias
 * accionables para mejorar el chatbot:
 * - Crear KB articles para preguntas recurrentes sin respuesta
 * - Agregar ejemplos de entrenamiento para intents con baja confianza
 * - Ajustar thresholds de confianza para intents problemáticos
 * - Recomendar nuevos skills para funcionalidades faltantes
 *
 * Las sugerencias se almacenan y pueden ser revisadas por el administrador.
 */

import { prisma } from '@/lib/db'
import { DetectedPattern } from './pattern-detector'
import { callAssistantWithFallback, OpenRouterMessage } from '@/lib/assistant/openrouter-client'

export interface ImprovementSuggestion {
  /** ID único de la sugerencia */
  id: string
  /** Tenant al que aplica */
  tenantId: string
  /** Tipo de mejora */
  type: SuggestionType
  /** Título descriptivo */
  title: string
  /** Descripción detallada */
  description: string
  /** Prioridad de implementación */
  priority: 'low' | 'medium' | 'high' | 'critical'
  /** Estado de la sugerencia */
  status: 'pending' | 'applied' | 'dismissed' | 'in_progress'
  /** Cómo implementar la sugerencia */
  implementationGuide: string
  /** Impacto estimado (texto) */
  estimatedImpact: string
  /** Categoría de la mejora */
  category: 'knowledge_base' | 'training' | 'configuration' | 'skill' | 'threshold' | 'infrastructure'
  /** Referencia al patrón que originó la sugerencia */
  sourcePattern: string
  /** Timestamp de creación */
  createdAt: Date
}

export type SuggestionType =
  | 'create_kb_article'
  | 'add_training_examples'
  | 'adjust_confidence_threshold'
  | 'improve_skill_error_handling'
  | 'create_new_skill'
  | 'update_system_prompt'
  | 'adjust_business_hours'
  | 'review_intent_classifier'
  | 'scale_infrastructure'

const DEFAULTS = {
  MAX_SUGGESTIONS: 10,
  MIN_INTERVAL_HOURS: 24, // No generar sugerencias duplicadas antes de 24h
}

/**
 * Genera sugerencias de mejora basadas en patrones detectados.
 * Analiza los patrones y usa DeepSeek V4 Flash para generar
 * sugerencias accionables cuando es necesario.
 */
export async function generateSuggestions(
  tenantId: string,
  patterns: DetectedPattern[]
): Promise<ImprovementSuggestion[]> {
  if (patterns.length === 0) return []

  try {
    // Verificar que no hayamos generado sugerencias recientemente
    const recentSuggestions = await getRecentSuggestions(tenantId, DEFAULTS.MIN_INTERVAL_HOURS)
    if (recentSuggestions.length >= DEFAULTS.MAX_SUGGESTIONS) {
      console.log(`[ImprovementEngine] Ya hay ${recentSuggestions.length} sugerencias activas. Saltando generación.`)
      return recentSuggestions
    }

    const suggestions: ImprovementSuggestion[] = []

    for (const pattern of patterns) {
      const suggestion = await generateSuggestionForPattern(tenantId, pattern)
      if (suggestion) {
        suggestions.push(suggestion)
      }
    }

    // Limitar número de sugerencias
    const finalSuggestions = suggestions.slice(0, DEFAULTS.MAX_SUGGESTIONS)

    // Guardar en BD
    for (const suggestion of finalSuggestions) {
      await saveSuggestion(suggestion)
    }

    if (finalSuggestions.length > 0) {
      console.log(`[ImprovementEngine] ✅ ${finalSuggestions.length} sugerencias generadas para tenant ${tenantId}`)
    }

    return finalSuggestions
  } catch (error) {
    console.error('[ImprovementEngine] Error:', error)
    return []
  }
}

/**
 * Genera una sugerencia específica para un patrón usando el LLM
 * o reglas predefinidas según el tipo de patrón.
 */
async function generateSuggestionForPattern(
  tenantId: string,
  pattern: DetectedPattern
): Promise<ImprovementSuggestion | null> {
  switch (pattern.type) {
    case 'high_unknown_rate':
      return suggestForHighUnknownRate(tenantId, pattern)
    case 'high_fallback_rate':
      return suggestForHighFallbackRate(tenantId, pattern)
    case 'skill_failure':
      return suggestForSkillFailure(tenantId, pattern)
    case 'sentiment_drop':
      return suggestForSentimentDrop(tenantId, pattern)
    case 'frequent_human_transfer':
      return suggestForFrequentTransfers(tenantId, pattern)
    case 'low_resolution_rate':
      return suggestForLowResolution(tenantId, pattern)
    case 'repeated_unanswered':
      return suggestForRepeatedUnanswered(tenantId, pattern)
    case 'peak_error_hour':
      return suggestForPeakErrorHour(tenantId, pattern)
    default:
      return null
  }
}

// ==================== GENERADORES POR TIPO ====================

async function suggestForHighUnknownRate(
  tenantId: string,
  pattern: DetectedPattern
): Promise<ImprovementSuggestion | null> {
  // Usar LLM para generar ejemplos de entrenamiento
  const examples = await generateTrainingExamples(tenantId, pattern)
  const criticalTag = pattern.severity === 'critical' ? ' 🔴' : ''

  return {
    id: generateId(),
    tenantId,
    type: 'add_training_examples',
    title: `Mejorar clasificación de intents${criticalTag}`,
    description: pattern.description,
    priority: pattern.severity === 'critical' ? 'critical' : 'high',
    status: 'pending',
    implementationGuide: `Agregar los siguientes ejemplos al IntentClassifierAgent:\n${examples || 'Revisar logs de intent=unknown para identificar patrones comunes.'}`,
    estimatedImpact: 'Reducir la tasa de unknown y mejorar la precisión del chatbot.',
    category: 'training',
    sourcePattern: pattern.type,
    createdAt: new Date(),
  }
}

async function suggestForHighFallbackRate(
  tenantId: string,
  pattern: DetectedPattern
): Promise<ImprovementSuggestion | null> {
  return {
    id: generateId(),
    tenantId,
    type: 'improve_skill_error_handling',
    title: 'Revisar manejo de errores en skills',
    description: pattern.description,
    priority: pattern.severity === 'critical' ? 'critical' : 'high',
    status: 'pending',
    implementationGuide: 'Revisar los skills con mayor tasa de error. Verificar: 1) Conexiones a APIs externas 2) Timeouts 3) Validación de parámetros de entrada 4) Manejo de errores con try/catch.',
    estimatedImpact: 'Reducir fallbacks y mejorar la experiencia del usuario.',
    category: 'skill',
    sourcePattern: pattern.type,
    createdAt: new Date(),
  }
}

async function suggestForSkillFailure(
  tenantId: string,
  pattern: DetectedPattern
): Promise<ImprovementSuggestion | null> {
  const skillName = pattern.context.skill || 'desconocido'

  return {
    id: generateId(),
    tenantId,
    type: 'improve_skill_error_handling',
    title: `Mejorar skill: ${skillName}`,
    description: pattern.description,
    priority: pattern.severity === 'critical' ? 'critical' : 'high',
    status: 'pending',
    implementationGuide: `Revisar el skill '${skillName}':\n1. Verificar parámetros de entrada\n2. Agregar validación de datos\n3. Mejorar manejo de errores\n4. Agregar logs para depuración\n5. Considerar agregar retry lógica`,
    estimatedImpact: `Reducir la tasa de error del skill ${skillName} y mejorar la confiabilidad.`,
    category: 'skill',
    sourcePattern: pattern.type,
    createdAt: new Date(),
  }
}

async function suggestForSentimentDrop(
  tenantId: string,
  pattern: DetectedPattern
): Promise<ImprovementSuggestion | null> {
  return {
    id: generateId(),
    tenantId,
    type: 'update_system_prompt',
    title: 'Ajustar tono del asistente',
    description: `El sentimiento promedio de los clientes es bajo (${pattern.value}/100). Revisar conversaciones para identificar el tono adecuado.`,
    priority: pattern.severity === 'critical' ? 'high' : 'medium',
    status: 'pending',
    implementationGuide: 'Revisar las últimas conversaciones con sentimiento negativo. Identificar si el problema es: 1) Tono muy formal 2) Respuestas muy largas 3) Falta de empatía 4) Incapacidad para resolver el problema. Ajustar el system prompt del asistente según corresponda.',
    estimatedImpact: 'Mejorar la satisfacción del cliente y reducir la tasa de abandono.',
    category: 'configuration',
    sourcePattern: pattern.type,
    createdAt: new Date(),
  }
}

async function suggestForFrequentTransfers(
  tenantId: string,
  pattern: DetectedPattern
): Promise<ImprovementSuggestion | null> {
  return {
    id: generateId(),
    tenantId,
    type: 'create_kb_article',
    title: 'Crear KB articles para consultas transferidas a humano',
    description: pattern.description,
    priority: pattern.severity === 'high' ? 'high' : 'medium',
    status: 'pending',
    implementationGuide: 'Analizar las conversaciones que resultaron en transferencia humana. Identificar el tema común y crear un KB article que el chatbot pueda usar para resolverlas autónomamente.',
    estimatedImpact: 'Reducir transferencias a humano y mejorar la tasa de auto-resolución.',
    category: 'knowledge_base',
    sourcePattern: pattern.type,
    createdAt: new Date(),
  }
}

async function suggestForLowResolution(
  tenantId: string,
  pattern: DetectedPattern
): Promise<ImprovementSuggestion | null> {
  return {
    id: generateId(),
    tenantId,
    type: 'update_system_prompt',
    title: 'Mejorar cierre de conversaciones',
    description: pattern.description,
    priority: pattern.severity === 'critical' ? 'critical' : 'high',
    status: 'pending',
    implementationGuide: 'Actualizar el system prompt para que el asistente: 1) Confirme explícitamente cuando un problema está resuelto 2) Pregunte "¿Hay algo más en que pueda ayudarte?" 3) Ofrezca alternativas si no puede resolver 4) Solicite feedback al finalizar.',
    estimatedImpact: 'Aumentar la tasa de resolución percibida por el cliente.',
    category: 'configuration',
    sourcePattern: pattern.type,
    createdAt: new Date(),
  }
}

async function suggestForRepeatedUnanswered(
  tenantId: string,
  pattern: DetectedPattern
): Promise<ImprovementSuggestion | null> {
  const topic = pattern.context.topic || 'tema recurrente'

  // Usar LLM para generar el contenido del KB article
  const kbContent = await generateKbContent(topic, pattern)

  return {
    id: generateId(),
    tenantId,
    type: 'create_kb_article',
    title: `Crear KB article: "${topic.substring(0, 60)}"`,
    description: pattern.description,
    priority: pattern.severity === 'high' ? 'high' : 'medium',
    status: 'pending',
    implementationGuide: `Crear un KB article con la siguiente información:\n${kbContent || 'Contenido pendiente de definir.'}\n\nCategoría sugerida: SOP o TECHNICAL`,
    estimatedImpact: `Resolver automáticamente consultas recurrentes sobre "${topic}".`,
    category: 'knowledge_base',
    sourcePattern: pattern.type,
    createdAt: new Date(),
  }
}

async function suggestForPeakErrorHour(
  tenantId: string,
  pattern: DetectedPattern
): Promise<ImprovementSuggestion | null> {
  return {
    id: generateId(),
    tenantId,
    type: 'scale_infrastructure',
    title: `Revisar infraestructura para hora pico: ${pattern.context.peakHour}:00h`,
    description: pattern.description,
    priority: pattern.severity === 'high' ? 'high' : 'medium',
    status: 'pending',
    implementationGuide: `Investigar la causa del pico de errores a las ${pattern.context.peakHour}:00h. Verificar: 1) Logs del servidor 2) Tareas programadas (cron) 3) Backups 4) Mantenimiento nocturno 5) Picos de tráfico.`,
    estimatedImpact: 'Eliminar picos de error y mejorar la disponibilidad del servicio.',
    category: 'infrastructure',
    sourcePattern: pattern.type,
    createdAt: new Date(),
  }
}

// ==================== GENERADORES CON LLM ====================

/**
 * Genera ejemplos de entrenamiento para intent classifier usando DeepSeek
 */
async function generateTrainingExamples(
  tenantId: string,
  pattern: DetectedPattern
): Promise<string> {
  try {
    const messages: OpenRouterMessage[] = [
      {
        role: 'system',
        content: `Eres un experto en NLP. Genera 5 ejemplos de mensajes de usuario (en español) para los intents más comunes de un CRM/ERP.

Los intents disponibles son: crear_lead, buscar_lead, agendar_cita, mis_citas, cancelar_cita, crear_tarea, completar_tarea, crear_nota, crear_negocio, mis_negocios, registrar_gasto, salud_inventario, help, consulta_general.

Genera ejemplos REALISTAS que un cliente real diría. Cada ejemplo debe incluir el intent y el mensaje.

Responde SOLO con el JSON array:
[
  { "intent": "crear_lead", "message": "agrega a Juan Pérez con email juan@email.com" }
]`
      },
      { role: 'user', content: `Genera ejemplos de entrenamiento para mejorar la clasificación. El problema actual es: ${pattern.description}` },
    ]

    const response = await callAssistantWithFallback(messages)
    const content = response.choices?.[0]?.message?.content || ''
    const jsonMatch = content.match(/\[[\s\S]*\]/)
    if (jsonMatch) {
      const examples = JSON.parse(jsonMatch[0])
      return examples.map((e: any) => `- Intent: ${e.intent} → "${e.message}"`).join('\n')
    }
    return 'Revisar los logs de intent=unknown para identificar los mensajes que no se clasifican correctamente.'
  } catch {
    return 'Revisar los logs de intent=unknown para identificar patrones.'
  }
}

/**
 * Genera contenido sugerido para un KB article usando DeepSeek
 */
async function generateKbContent(
  topic: string,
  pattern: DetectedPattern
): Promise<string> {
  try {
    const messages: OpenRouterMessage[] = [
      {
        role: 'system',
        content: `Eres un escritor técnico. Genera un borrador para un artículo de knowledge base en español.

El artículo debe ser claro, conciso y útil para un chatbot que responde preguntas de clientes.

Responde con:
TÍTULO: (título sugerido)
CONTENIDO: (2-3 párrafos de contenido útil)`
      },
      { role: 'user', content: `Crea un KB article sobre: "${topic}"` },
    ]

    const response = await callAssistantWithFallback(messages)
    const content = response.choices?.[0]?.message?.content || ''
    return content
  } catch {
    return `TÍTULO: Sobre ${topic}\nCONTENIDO: [Contenido pendiente de redactar]`
  }
}

// ==================== HELPERS ====================

function generateId(): string {
  return `imp_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`
}

async function saveSuggestion(suggestion: ImprovementSuggestion): Promise<void> {
  try {
    // Verificar si ya existe una sugerencia similar
    const existing = await prisma.chatbotAuditLog.findFirst({
      where: {
        tenantId: suggestion.tenantId,
        intent: 'improvement_suggestion',
        createdAt: { gte: new Date(Date.now() - DEFAULTS.MIN_INTERVAL_HOURS * 60 * 60 * 1000) },
        skillParams: {
          path: ['type'],
          equals: suggestion.type,
        },
      },
    })

    if (existing) {
      // Ya existe una sugerencia similar reciente, no duplicar
      return
    }

    await prisma.chatbotAuditLog.create({
      data: {
        tenantId: suggestion.tenantId,
        intent: 'improvement_suggestion',
        // `status` es obligatorio en ChatbotAuditLog: sin él el create fallaba
        // en validación y el catch lo reducía a un console.error, así que la
        // sugerencia no se guardaba nunca (y `getRecentSuggestions` la veía
        // una y otra vez como nueva).
        status: 'SUCCESS',
        skillParams: {
          id: suggestion.id,
          type: suggestion.type,
          title: suggestion.title,
          description: suggestion.description,
          priority: suggestion.priority,
          severity: suggestion.priority === 'critical' ? 'critical' :
                   suggestion.priority === 'high' ? 'high' : 'info',
          status: suggestion.status,
          implementationGuide: suggestion.implementationGuide,
          estimatedImpact: suggestion.estimatedImpact,
          category: suggestion.category,
          sourcePattern: suggestion.sourcePattern,
        },
      },
    })
  } catch (error) {
    console.error('[ImprovementEngine] Error guardando sugerencia:', error)
  }
}

/**
 * Obtiene sugerencias recientes para un tenant
 */
export async function getRecentSuggestions(
  tenantId: string,
  hours: number = 48
): Promise<ImprovementSuggestion[]> {
  try {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000)
    const logs = await prisma.chatbotAuditLog.findMany({
      where: {
        tenantId,
        intent: 'improvement_suggestion',
        createdAt: { gte: since },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })

    return logs.map(log => ({
      id: (log.skillParams as any)?.id || generateId(),
      tenantId,
      type: (log.skillParams as any)?.type || 'add_training_examples',
      title: (log.skillParams as any)?.title || 'Sugerencia sin título',
      description: (log.skillParams as any)?.description || '',
      priority: (log.skillParams as any)?.priority || 'medium',
      status: (log.skillParams as any)?.status || 'pending',
      implementationGuide: (log.skillParams as any)?.implementationGuide || '',
      estimatedImpact: (log.skillParams as any)?.estimatedImpact || '',
      category: (log.skillParams as any)?.category || 'configuration',
      sourcePattern: (log.skillParams as any)?.sourcePattern || '',
      createdAt: log.createdAt,
    }))
  } catch {
    return []
  }
}

/**
 * Marca una sugerencia como aplicada o descartada
 */
export async function updateSuggestionStatus(
  tenantId: string,
  suggestionId: string,
  status: 'applied' | 'dismissed' | 'in_progress'
): Promise<boolean> {
  try {
    const existing = await prisma.chatbotAuditLog.findFirst({
      where: {
        tenantId,
        intent: 'improvement_suggestion',
        skillParams: { path: ['id'], equals: suggestionId },
      },
    })

    if (!existing) return false

    await prisma.chatbotAuditLog.update({
      where: { id: existing.id },
      data: {
        skillParams: {
          ...(existing.skillParams as any),
          status,
        },
      },
    })

    return true
  } catch {
    return false
  }
}
