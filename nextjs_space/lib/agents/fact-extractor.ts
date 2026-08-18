/**
 * FactExtractorAgent - Extracción activa de datos del cliente
 *
 * Tras cada mensaje del usuario, analiza el contenido para extraer
 * datos factuales sobre el cliente: nombre, email, teléfono, empresa,
 * intereses, problemas reportados, preferencias, etc.
 *
 * Los facts extraídos se almacenan en el contexto de la conversación
 * y se reutilizan en mensajes futuros para personalizar la respuesta.
 *
 * Diferencias con EntityExtractor:
 * - EntityExtractor: extrae parámetros para EJECUTAR una acción (ej: fecha/hora para agendar)
 * - FactExtractor: extrae datos PERMANENTES del cliente (ej: "el cliente es dueño de una PYME")
 */

import { callAssistantWithFallback, OpenRouterMessage } from '@/lib/assistant/openrouter-client'

export interface ExtractedFact {
  /** Categoría del fact */
  category: FactCategory
  /** Valor del fact en texto */
  value: string
  /** Confianza de la extracción (0-1) */
  confidence: number
}

export type FactCategory =
  | 'contact_info'      // nombre, email, teléfono, empresa
  | 'preference'        // preferencias de producto/servicio
  | 'pain_point'        // problemas o necesidades reportadas
  | 'intent_signal'     // señal de intención de compra
  | 'objection'         // objeción o duda
  | 'timing'            // disponibilidad, plazos, urgencia
  | 'competitor'        // mención de competidores
  | 'budget'            // información presupuestaria
  | 'interest'          // interés en funcionalidad específica
  | 'general'           // otra información relevante

// Umbral de confianza para aceptar un fact extraído
const CONFIDENCE_THRESHOLD = 0.6

/**
 * Reduce facts duplicados o redundantes.
 * Si dos facts tienen la misma categoría y contenido similar, se queda el de mayor confianza.
 */
function deduplicateFacts(newFacts: ExtractedFact[], existingFacts: string[]): ExtractedFact[] {
  return newFacts.filter(newFact => {
    if (newFact.confidence < CONFIDENCE_THRESHOLD) return false

    const newLower = newFact.value.toLowerCase()
    const isDuplicate = existingFacts.some(existing => {
      const existingLower = existing.toLowerCase()

      // Si el fact existente ya contiene este valor, es duplicado
      if (existingLower.includes(newLower) || newLower.includes(existingLower)) {
        return true
      }

      // Si son de la misma categoría y hablan de lo mismo
      const existingCategory = existing.split(':')[0]?.trim().toLowerCase()
      const newCategoryPrefix = FACT_LABELS[newFact.category].toLowerCase()
      if (existingCategory === newCategoryPrefix) {
        const existingValue = existing.substring(existing.indexOf(':') + 1).trim().toLowerCase()
        if (existingValue.includes(newLower) || newLower.includes(existingValue)) {
          return true
        }
      }

      return false
    })

    return !isDuplicate
  })
}

const FACT_LABELS: Record<FactCategory, string> = {
  contact_info: 'Contacto',
  preference: 'Preferencia',
  pain_point: 'Problema',
  intent_signal: 'Intención',
  objection: 'Objeción',
  timing: 'Disponibilidad',
  competitor: 'Competidor',
  budget: 'Presupuesto',
  interest: 'Interés',
  general: 'Info',
}

/**
 * Extrae facts de un mensaje del usuario usando DeepSeek V4 Flash.
 * Se ejecuta en paralelo con la respuesta principal (fire-and-forget).
 */
export async function extractFacts(
  message: string,
  existingFacts: string[],
  context?: {
    intent?: string
    tenantName?: string
  }
): Promise<ExtractedFact[]> {
  // Si el mensaje es muy corto, probablemente no hay facts que extraer
  if (message.trim().length < 5) return []

  const existingContext = existingFacts.length > 0
    ? `Datos ya conocidos:\n${existingFacts.map(f => `- ${f}`).join('\n')}`
    : 'No hay datos previos.'

  const intentContext = context?.intent
    ? `\nIntención detectada: ${context.intent}`
    : ''

  const systemPrompt = `Eres un extractor de información factual de clientes para un sistema CRM.

Analiza el mensaje del usuario y extrae SOLO datos factuales y objetivos.
NO inventes información. Si no hay datos relevantes, responde con array vacío.

${existingContext}${intentContext}

CATEGORÍAS:
- contact_info: nombre, email, teléfono, empresa, cargo
- preference: preferencias sobre productos/servicios/canales
- pain_point: problemas, frustraciones o necesidades específicas
- intent_signal: señales de que quiere comprar o contratar
- objection: dudas, objeciones o rechazos
- timing: plazos, urgencia, disponibilidad horaria
- competitor: mención de otras empresas/soluciones
- budget: presupuesto, rangos de precio, capacidad de pago
- interest: interés en funcionalidades o módulos específicos
- general: otra información relevante sobre el cliente

REGLAS:
1. Extrae SOLO lo que el usuario dice EXPLÍCITAMENTE. NO infieras.
2. Ignora saludos, despedidas, y conversación trivial.
3. Si el dato ya está en "Datos ya conocidos", NO lo incluyas de nuevo (a menos que el usuario lo haya confirmado o actualizado).
4. Confianza (0-1):
   - 0.9+: Dato explícito y claro ("Me llamo Juan Pérez")
   - 0.7-0.8: Dato mencionado pero no completamente claro ("Soy de una empresa de logística")
   - 0.5-0.6: Inferencia razonable
   - <0.5: Descartar (no incluir)

Responde ÚNICAMENTE con un JSON array, sin markdown:
[
  { "category": "contact_info", "value": "Nombre: Juan Pérez", "confidence": 0.95 },
  { "category": "pain_point", "value": "Problema: dificultad para gestionar inventario manualmente", "confidence": 0.85 }
]`

  try {
    const messages: OpenRouterMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: message },
    ]

    const response = await callAssistantWithFallback(messages, 5000)
    const content = response.choices?.[0]?.message?.content || ''

    // Extraer JSON array
    const jsonMatch = content.match(/\[[\s\S]*\]/)
    if (!jsonMatch) {
      console.warn('[FactExtractor] No se encontró JSON en la respuesta')
      return []
    }

    const raw: ExtractedFact[] = JSON.parse(jsonMatch[0])

    if (!Array.isArray(raw)) {
      console.warn('[FactExtractor] Respuesta no es un array')
      return []
    }

    // Validar y filtrar
    const valid = raw.filter(f =>
      f.category &&
      f.value &&
      typeof f.confidence === 'number' &&
      f.confidence >= CONFIDENCE_THRESHOLD
    )

    const deduplicated = deduplicateFacts(valid, existingFacts)

    if (deduplicated.length > 0) {
      console.log(`[FactExtractor] Extraídos ${deduplicated.length} facts nuevos:`,
        deduplicated.map(f => `${FACT_LABELS[f.category]}: ${f.value.substring(0, 50)}`).join(', '))
    }

    return deduplicated
  } catch (error) {
    console.error('[FactExtractor] Error:', error)
    return []
  }
}

/**
 * Formatea un ExtractedFact como string para almacenar en facts[]
 */
export function formatFact(fact: ExtractedFact): string {
  const label = FACT_LABELS[fact.category] || 'Info'
  return `${label}: ${fact.value}`
}

/**
 * Formatea múltiples facts como strings
 */
export function formatFacts(facts: ExtractedFact[]): string[] {
  return facts.map(formatFact)
}

/**
 * Construye un bloque legible de facts para el system prompt
 */
export function buildFactsBlock(facts: string[]): string {
  if (facts.length === 0) return ''

  // Agrupar facts por categoría
  const grouped: Record<string, string[]> = {}
  for (const fact of facts) {
    const category = fact.split(':')[0] || 'Info'
    if (!grouped[category]) grouped[category] = []
    grouped[category].push(fact)
  }

  const parts: string[] = ['\n\n📋 INFORMACIÓN DEL CLIENTE:']
  for (const [category, items] of Object.entries(grouped)) {
    parts.push(`\n${category}:`)
    items.forEach(item => parts.push(`  • ${item.substring(item.indexOf(':') + 1).trim()}`))
  }

  return parts.join('\n')
}
