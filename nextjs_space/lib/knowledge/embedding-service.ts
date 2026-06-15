import { generateEmbedding, generateQueryEmbedding, type EmbeddingResult } from '@/lib/assistant/openrouter-client'

/**
 * Servicio de embeddings para la Knowledge Base.
 *
 * Genera vectores de embedding usando OpenRouter (intfloat/e5-large-v2, 1024-dim),
 * los almacena en el campo `vectorId` de KnowledgeArticle como JSON,
 * y permite búsqueda semántica por similitud coseno.
 *
 * Costo: ~$0.00013/1K tokens — insignificante para artículos de KB.
 */

export interface StoredEmbedding {
  /** Vector de embedding como array de floats */
  v: number[]
  /** Timestamp de generación */
  ts: number
  /** Modelo usado */
  model: string
}

/**
 * Convierte un array de floats a string JSON compacta para almacenar en BD.
 */
function serializeEmbedding(embedding: number[], model: string): string {
  const stored: StoredEmbedding = {
    v: embedding,
    ts: Date.now(),
    model,
  }
  return JSON.stringify(stored)
}

/**
 * Deserializa un embedding almacenado.
 */
function deserializeEmbedding(stored: string | null): StoredEmbedding | null {
  if (!stored || stored.length < 10) return null
  try {
    const parsed = JSON.parse(stored) as StoredEmbedding
    if (!parsed.v || !Array.isArray(parsed.v) || parsed.v.length === 0) return null
    return parsed
  } catch {
    return null
  }
}

/**
 * Calcula la similitud coseno entre dos vectores.
 * Retorna un valor entre -1 y 1 (mayor = más similar).
 */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0
  let dot = 0
  let normA = 0
  let normB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB)
  if (denom === 0) return 0
  return dot / denom
}

export class EmbeddingService {
  /**
   * Genera y serializa un embedding para un artículo de conocimiento.
   * Concatena título + contenido para el embedding.
   */
  static async generateForArticle(title: string, content: string): Promise<string> {
    // Chunking simple: título + primeros 2000 chars del contenido
    const text = `${title}\n${content.substring(0, 2000)}`
    const result = await generateEmbedding(text)
    console.log(`[EmbeddingService] Generado embedding (${result.embedding.length} dims, ${result.tokens} tokens)`)
    return serializeEmbedding(result.embedding, 'intfloat/e5-large-v2')
  }

  /**
   * Busca los artículos más similares semánticamente a una query.
   *
   * @param query - Texto de búsqueda del usuario
   * @param articles - Array de artículos con su vectorId (embedding serializado)
   * @param topK - Número de resultados a retornar
   * @param minSimilarity - Umbral mínimo de similitud coseno (0-1)
   */
  static async searchArticles(
    query: string,
    articles: Array<{ id: string; title: string; content: string; category: string; tags: string[]; vectorId: string | null }>,
    topK: number = 5,
    minSimilarity: number = 0.3,
  ): Promise<Array<{ id: string; title: string; content: string; category: string; tags: string[]; similarity: number }>> {
    // Generar embedding de la query
    const queryResult = await generateQueryEmbedding(query)
    const queryEmbedding = queryResult.embedding

    if (!queryEmbedding || queryEmbedding.length === 0) {
      console.warn('[EmbeddingService] Query embedding vacío, usando fallback textual')
      return []
    }

    // Calcular similitud con cada artículo que tenga embedding
    const scored: Array<{ id: string; title: string; content: string; category: string; tags: string[]; similarity: number }> = []

    for (const article of articles) {
      const stored = deserializeEmbedding(article.vectorId)
      if (!stored) continue

      const similarity = cosineSimilarity(queryEmbedding, stored.v)

      if (similarity >= minSimilarity) {
        scored.push({
          id: article.id,
          title: article.title,
          content: article.content,
          category: article.category,
          tags: article.tags,
          similarity,
        })
      }
    }

    // Ordenar por similitud descendente y tomar topK
    scored.sort((a, b) => b.similarity - a.similarity)
    const top = scored.slice(0, topK)

    console.log(`[EmbeddingService] Búsqueda: "${query.substring(0, 40)}..." → ${top.length} resultados (de ${articles.length} artículos)`)

    return top
  }

  /**
   * Fallback: búsqueda textual simple cuando no hay embeddings disponibles.
   * Usa contains en título, contenido y tags.
   */
  static searchTextual(
    query: string,
    articles: Array<{ id: string; title: string; content: string; category: string; tags: string[] }>,
    topK: number = 5,
  ): Array<{ id: string; title: string; content: string; category: string; tags: string[]; similarity: number }> {
    const queryLower = query.toLowerCase()
    const queryWords = queryLower.split(/\s+/).filter(w => w.length > 1)

    const scored = articles.map(article => {
      let score = 0
      const titleLower = article.title.toLowerCase()
      const contentLower = article.content.toLowerCase()

      // Coincidencia exacta en título
      if (titleLower.includes(queryLower)) score += 3
      // Coincidencia exacta en contenido
      if (contentLower.includes(queryLower)) score += 2
      // Coincidencia de palabras individuales en título
      for (const word of queryWords) {
        if (titleLower.includes(word)) score += 1
      }
      // Coincidencia de tags
      for (const tag of article.tags) {
        if (queryLower.includes(tag.toLowerCase())) score += 2
      }

      return {
        ...article,
        similarity: Math.min(score / 10, 1.0),
      }
    })

    scored.sort((a, b) => b.similarity - a.similarity)
    const top = scored.filter(a => a.similarity > 0).slice(0, topK)

    console.log(`[EmbeddingService] Búsqueda textual fallback: "${query.substring(0, 40)}..." → ${top.length} resultados`)

    return top
  }
}
