/**
 * Reranker - Re-ranking de resultados de RAG
 *
 * Mejora la relevancia de los resultados de búsqueda semántica
 * usando DeepSeek V4 Flash para evaluar contextualmente
 * qué artículos son más útiles para responder la consulta del usuario.
 *
 * Pipeline:
 * 1. Búsqueda semántica inicial (cosine similarity) → top N
 * 2. Re-ranking con LLM → top K (con puntuación de relevancia)
 * 3. Solo inyectar en prompt si superan umbral de relevancia
 */

import { callAssistantWithFallback, OpenRouterMessage } from '@/lib/assistant/openrouter-client'

export interface RankedResult {
  id: string
  title: string
  content: string
  category: string
  tags: string[]
  /** Puntuación del re-ranker (0-100) */
  relevanceScore: number
  /** Razón breve de por qué es relevante */
  relevanceReason: string
  /** Similitud coseno original (si aplica) */
  originalSimilarity?: number
}

const MAX_INPUT_RESULTS = 8
const MAX_OUTPUT_RESULTS = 3
const MIN_RELEVANCE_SCORE = 30 // Ignorar resultados por debajo de este umbral

/**
 * Re-ranking de resultados de KB usando DeepSeek V4 Flash.
 *
 * Toma los resultados de búsqueda semántica y los re-ordena
 * según relevancia contextual para la consulta del usuario.
 *
 * @param query - Consulta original del usuario
 * @param results - Resultados de búsqueda semántica (hasta MAX_INPUT_RESULTS)
 * @param conversationContext - Contexto breve de la conversación (opcional)
 * @returns Resultados re-rankeados, ordenados por relevancia descendente
 */
export async function rerankResults(
  query: string,
  results: Array<{ id: string; title: string; content: string; category: string; tags: string[]; similarity?: number }>,
  conversationContext?: string
): Promise<RankedResult[]> {
  if (results.length === 0) return []
  if (results.length === 1) {
    // Con un solo resultado, evaluar si es relevante
    const relevance = await evaluateSingleResult(query, results[0], conversationContext)
    return relevance.score >= MIN_RELEVANCE_SCORE ? [relevance] : []
  }

  // Limitar inputs para no saturar el contexto del LLM
  const candidates = results.slice(0, MAX_INPUT_RESULTS)

  // Truncar contenido largo para el prompt
  const candidatesText = candidates.map((r, i) => {
    const contentPreview = r.content.substring(0, 500)
    return `[${i + 1}] "${r.title}" (${r.category})
Tags: ${r.tags.join(', ') || 'ninguno'}
Contenido: ${contentPreview}
---`
  }).join('\n')

  const contextBlock = conversationContext
    ? `\nContexto de la conversación: ${conversationContext}\n`
    : ''

  const systemPrompt = `Eres un re-ranker de artículos de knowledge base. Tu tarea es evaluar qué artículos son MÁS RELEVANTES para responder la consulta del usuario.

CONSULTA DEL USUARIO: "${query}"${contextBlock}

ARTÍCULOS DISPONIBLES:
${candidatesText}

INSTRUCCIONES:
1. Evalúa CADA artículo individualmente según su relevancia para la consulta.
2. Puntúa del 0 al 100 (0 = irrelevante, 100 = respuesta perfecta).
3. Considera: ¿El título coincide? ¿El contenido responde la pregunta? ¿La categoría es apropiada?
4. Sé estricto: si un artículo solo menciona palabras similares pero no responde la pregunta, puntúa bajo.
5. Si el contexto de la conversación es relevante, úsalo para afinar la puntuación.

Responde ÚNICAMENTE con un JSON array, sin markdown ni texto adicional:
[
  {
    "index": 1,
    "score": 85,
    "reason": "Razón breve de por qué es relevante (máximo 20 palabras)"
  }
]

Incluye SOLO los artículos con score >= ${MIN_RELEVANCE_SCORE}. Ordénalos por score descendente.
Máximo ${MAX_OUTPUT_RESULTS} resultados en la respuesta.`

  try {
    const messages: OpenRouterMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: 'Evalúa la relevancia de estos artículos para la consulta.' },
    ]

    const response = await callAssistantWithFallback(messages)
    const content = response.choices?.[0]?.message?.content || ''

    // Extraer JSON array
    const jsonMatch = content.match(/\[[\s\S]*\]/)
    if (!jsonMatch) {
      throw new Error('No se encontró JSON array en la respuesta')
    }

    const rankings: Array<{ index: number; score: number; reason: string }> = JSON.parse(jsonMatch[0])

    // Mapear rankings a resultados originales
    const ranked = rankings
      .filter(r => r.score >= MIN_RELEVANCE_SCORE)
      .map(r => {
        const original = candidates[r.index - 1]
        if (!original) return null
        return {
          id: original.id,
          title: original.title,
          content: original.content,
          category: original.category,
          tags: original.tags,
          relevanceScore: r.score,
          relevanceReason: r.reason,
          originalSimilarity: original.similarity,
        } as RankedResult
      })
      .filter((r): r is RankedResult => r !== null)
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .slice(0, MAX_OUTPUT_RESULTS)

    console.log(`[Reranker] "${query.substring(0, 40)}..." → ${ranked.length} resultados relevantes de ${candidates.length} candidatos`)

    return ranked
  } catch (error) {
    console.error('[Reranker] Error:', error)
    // Fallback: devolver top resultados por similitud original
    console.log('[Reranker] Usando fallback: orden original por similitud')
    return results
      .slice(0, MAX_OUTPUT_RESULTS)
      .map(r => ({
        id: r.id,
        title: r.title,
        content: r.content,
        category: r.category,
        tags: r.tags,
        relevanceScore: Math.round((r.similarity || 0.5) * 100),
        relevanceReason: 'Relevancia por similitud semántica',
        originalSimilarity: r.similarity,
      }))
  }
}

/**
 * Evalúa un único resultado (caso edge cuando solo hay 1 candidato)
 */
async function evaluateSingleResult(
  query: string,
  result: { id: string; title: string; content: string; category: string; tags: string[]; similarity?: number },
  conversationContext?: string
): Promise<RankedResult> {
  const contentPreview = result.content.substring(0, 500)
  const contextBlock = conversationContext ? `\nContexto: ${conversationContext}` : ''

  const systemPrompt = `Evalúa si el siguiente artículo de knowledge base es RELEVANTE para responder la consulta del usuario.

CONSULTA: "${query}"${contextBlock}

ARTÍCULO: "${result.title}" (${result.category})
CONTENIDO: ${contentPreview}

Responde ÚNICAMENTE con un JSON:
{ "score": 0-100, "reason": "razón breve" }

-score 0-29: Irrelevante
-score 30-59: Parcialmente relevante
-score 60-100: Relevante`

  try {
    const messages: OpenRouterMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: 'Evalúa la relevancia de este artículo.' },
    ]

    const response = await callAssistantWithFallback(messages)
    const content = response.choices?.[0]?.message?.content || ''
    const jsonMatch = content.match(/\{[\s\S]*\}/)
    const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : { score: 50, reason: 'Evaluación fallback' }

    return {
      id: result.id,
      title: result.title,
      content: result.content,
      category: result.category,
      tags: result.tags,
      relevanceScore: parsed.score || 50,
      relevanceReason: parsed.reason || 'Relevancia estimada',
      originalSimilarity: result.similarity,
    }
  } catch {
    return {
      id: result.id,
      title: result.title,
      content: result.content,
      category: result.category,
      tags: result.tags,
      relevanceScore: Math.round((result.similarity || 0.5) * 100),
      relevanceReason: 'Relevancia por similitud semántica',
      originalSimilarity: result.similarity,
    }
  }
}

/**
 * Construye el bloque de KB para el prompt, formateando resultados rankeados
 */
export function buildKbBlock(rankedResults: RankedResult[]): string {
  if (rankedResults.length === 0) return ''

  const parts: string[] = []
  parts.push('\n\nINFORMACIÓN DE REFERENCIA:')

  rankedResults.forEach((r, i) => {
    const relevanceBadge = r.relevanceScore >= 70 ? '🟢' : r.relevanceScore >= 45 ? '🟡' : '⚪'
    parts.push(`\n${relevanceBadge} [${r.category}] ${r.title} (relevancia: ${r.relevanceScore}%)`)
    parts.push(r.content.substring(0, 600))
  })

  return parts.join('\n')
}
