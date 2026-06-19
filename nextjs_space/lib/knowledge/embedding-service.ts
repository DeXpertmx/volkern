import { generateEmbedding, generateQueryEmbedding, type EmbeddingResult } from '@/lib/assistant/openrouter-client'

/**
 * Servicio de embeddings para la Knowledge Base.
 *
 * Pipeline primario: OpenRouter (intfloat/e5-large-v2, 1024-dim).
 * Fallback local: TF-IDF vectorizer (sin API externa, ~500-2000 dims según vocabulario).
 *
 * Los embeddings se almacenan en el campo `vectorId` como JSON.
 * Costo OpenRouter: ~$0.00013/1K tokens — insignificante para artículos de KB.
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
    // Detectar si hay embeddings locales (TF-IDF)
    const hasLocalEmbeddings = articles.some(a => a.vectorId?.includes('local/tfidf'))
    const hasApiEmbeddings = articles.some(a => a.vectorId && !a.vectorId.includes('local/tfidf'))

    // Intentar API primero si hay embeddings de API
    if (hasApiEmbeddings) {
      try {
        const queryResult = await generateQueryEmbedding(query)
        const queryEmbedding = queryResult.embedding

        if (queryEmbedding && queryEmbedding.length > 0) {
          const scored: Array<{ id: string; title: string; content: string; category: string; tags: string[]; similarity: number }> = []

          for (const article of articles) {
            const stored = deserializeEmbedding(article.vectorId)
            if (!stored || stored.model === 'local/tfidf') continue

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

          scored.sort((a, b) => b.similarity - a.similarity)
          const top = scored.slice(0, topK)
          console.log(`[EmbeddingService] Búsqueda API: "${query.substring(0, 40)}..." → ${top.length} resultados (de ${articles.length} artículos)`)
          if (top.length > 0) return top
        }
      } catch (error) {
        console.warn('[EmbeddingService] API embedding falló, usando búsqueda local:', error)
      }
    }

    // Fallback: búsqueda local TF-IDF
    if (hasLocalEmbeddings) {
      const localResults = this.searchLocal(query, articles, topK, 0.02)
      if (localResults.length > 0) return localResults
    }

    return []
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

  // ─── LOCAL TF-IDF EMBEDDING (sin API externa) ──────────────────────────

  private static STOP_WORDS = new Set([
    'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas', 'de', 'del', 'en',
    'a', 'ante', 'bajo', 'cabe', 'con', 'contra', 'desde', 'durante', 'entre',
    'hacia', 'hasta', 'para', 'por', 'según', 'sin', 'sobre', 'tras',
    'y', 'e', 'ni', 'o', 'u', 'que', 'cual', 'cuales', 'quien', 'quienes',
    'cuyo', 'cuya', 'cuyos', 'cuyas', 'donde', 'cuando', 'como', 'cuanto',
    'es', 'son', 'se', 'su', 'sus', 'al', 'lo', 'le', 'les', 'me', 'te',
    'nos', 'os', 'ha', 'han', 'he', 'has', 'había', 'habían', 'fue', 'fueron',
    'ser', 'estar', 'tener', 'hacer', 'poder', 'decir', 'ir', 'ver', 'dar',
    'saber', 'querer', 'llegar', 'pasar', 'deber', 'poner', 'parecer',
    'quedar', 'creer', 'hablar', 'llevar', 'dejar', 'seguir', 'encontrar',
    'llamar', 'este', 'esta', 'estos', 'estas', 'ese', 'esa', 'esos', 'esas',
    'aquel', 'aquella', 'aquellos', 'aquellas', 'todo', 'toda', 'todos', 'todas',
    'otro', 'otra', 'otros', 'otras', 'mucho', 'mucha', 'muchos', 'muchas',
    'poco', 'poca', 'pocos', 'pocas', 'más', 'menos', 'muy', 'tan', 'tanto',
    'si', 'no', 'ya', 'aún', 'así', 'solo', 'sólo', 'sí', 'cada',
    'pero', 'porque', 'pues', 'aunque', 'mientras', 'además', 'entonces',
    'también', 'sino', 'después', 'antes', 'después', 'luego', 'siempre',
    'nunca', 'ahora', 'hoy', 'ayer', 'mañana', 'allí', 'aquí', 'allá',
    'cerca', 'lejos', 'dentro', 'fuera', 'donde', 'cuando', 'cómo',
    'cuál', 'cuáles', 'cuánto', 'cuánta', 'cuántos', 'cuántas',
  ])

  /**
   * Tokeniza texto en español: lowercase, split por no-alfabéticos, filtra stopwords y palabras cortas.
   */
  private static tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // quitar acentos
      .split(/[^a-záéíóúüñ0-9]+/)
      .filter(w => w.length > 2 && !this.STOP_WORDS.has(w))
  }

  /**
   * Genera embeddings TF-IDF locales para todos los artículos sin vectorId.
   *
   * Pipeline:
   * 1. Obtiene todos los artículos (con y sin embedding)
   * 2. Construye vocabulario global
   * 3. Calcula TF-IDF para cada artículo sin vectorId
   * 4. Normaliza vectores (L2)
   * 5. Serializa y guarda en BD
   *
   * @returns Número de embeddings generados
   */
  static async generateLocalEmbeddings(): Promise<number> {
    const prisma = (await import('@/lib/db')).prisma

    const allArticles = await prisma.knowledgeArticle.findMany({
      select: { id: true, title: true, content: true, vectorId: true },
    })

    if (allArticles.length === 0) return 0

    // 1. Construir vocabulario global (de TODOS los artículos)
    const docTokens: string[][] = []
    const vocabSet = new Set<string>()

    for (const article of allArticles) {
      const tokens = this.tokenize(`${article.title} ${article.content}`)
      docTokens.push(tokens)
      for (const t of tokens) vocabSet.add(t)
    }

    const vocabulary = Array.from(vocabSet)
    console.log(`[EmbeddingService] Vocabulario TF-IDF: ${vocabulary.length} términos de ${allArticles.length} docs`)

    // 2. Calcular IDF para cada término
    const docFreq = new Map<string, number>()
    for (const tokens of docTokens) {
      const unique = new Set(tokens)
      for (const t of unique) {
        docFreq.set(t, (docFreq.get(t) || 0) + 1)
      }
    }

    const N = allArticles.length
    const idf = new Map<string, number>()
    for (const [term, df] of docFreq) {
      idf.set(term, Math.log((N + 1) / (df + 1)) + 1)
    }

    // 3. Generar TF-IDF para cada artículo que NO tenga embedding
    let generated = 0

    for (let i = 0; i < allArticles.length; i++) {
      const article = allArticles[i]

      // Saltar si ya tiene embedding
      if (article.vectorId) continue

      const tokens = docTokens[i]

      // TF
      const tf = new Map<string, number>()
      for (const t of tokens) {
        tf.set(t, (tf.get(t) || 0) + 1)
      }
      const maxTf = Math.max(1, ...tf.values())

      // TF-IDF vector
      const vector: number[] = []
      for (const term of vocabulary) {
        const tfNorm = (tf.get(term) || 0) / maxTf
        const idfVal = idf.get(term) || 0
        vector.push(tfNorm * idfVal)
      }

      // Normalizar L2
      const norm = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0))
      const normalized = norm > 0 ? vector.map(v => v / norm) : vector

      // Guardar (incluye vocabulario + IDF para queries futuras)
      const idfValues = vocabulary.map(term => idf.get(term) || 0)
      const serialized = JSON.stringify({
        v: normalized,
        ts: Date.now(),
        model: 'local/tfidf',
        vocab: vocabulary,
        idf: idfValues,
      })

      await prisma.knowledgeArticle.update({
        where: { id: article.id },
        data: { vectorId: serialized },
      })

      generated++
      console.log(`[EmbeddingService] ✅ TF-IDF local: [${article.title.substring(0, 50)}] (${vocabulary.length} dims)`)
    }

    console.log(`[EmbeddingService] 🎯 ${generated} embeddings TF-IDF generados localmente`)
    return generated
  }

  /**
   * Búsqueda semántica usando embeddings locales (TF-IDF).
   * Se usa como parte del pipeline de searchArticles cuando detecta embeddings 'local/tfidf'.
   */
  private static searchLocal(
    query: string,
    articles: Array<{ id: string; title: string; content: string; category: string; tags: string[]; vectorId: string | null }>,
    topK: number = 5,
    minSimilarity: number = 0.02,
  ): Array<{ id: string; title: string; content: string; category: string; tags: string[]; similarity: number }> {
    // Obtener vocabulario + IDF del primer artículo local (todos comparten el mismo)
    const firstLocal = articles.find(a => a.vectorId && a.vectorId.includes('local/tfidf'))
    if (!firstLocal?.vectorId) return []

    let vocabulary: string[] = []
    let idfValues: number[] = []
    try {
      const parsed = JSON.parse(firstLocal.vectorId)
      vocabulary = parsed.vocab || []
      idfValues = parsed.idf || []
    } catch { return [] }

    if (vocabulary.length === 0) return []

    // Tokenizar query y construir vector TF-IDF (aplicando IDF del corpus)
    const queryTokens = this.tokenize(query)
    const tf = new Map<string, number>()
    for (const t of queryTokens) {
      tf.set(t, (tf.get(t) || 0) + 1)
    }
    const maxTf = Math.max(1, ...tf.values())

    const queryVector: number[] = vocabulary.map((term, i) => {
      const tfNorm = (tf.get(term) || 0) / maxTf
      return tfNorm * (idfValues[i] || 0)
    })

    // Normalizar query
    const qNorm = Math.sqrt(queryVector.reduce((s, v) => s + v * v, 0))
    const qNormalized = qNorm > 0 ? queryVector.map(v => v / qNorm) : queryVector

    // Cosine similarity con cada artículo
    const scored: Array<{ id: string; title: string; content: string; category: string; tags: string[]; similarity: number }> = []

    for (const article of articles) {
      const stored = deserializeEmbedding(article.vectorId)
      if (!stored) continue

      const similarity = cosineSimilarity(qNormalized, stored.v)

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

    scored.sort((a, b) => b.similarity - a.similarity)
    const top = scored.slice(0, topK)

    console.log(`[EmbeddingService] Búsqueda TF-IDF local: "${query.substring(0, 40)}..." → ${top.length} resultados`)

    return top
  }
}
