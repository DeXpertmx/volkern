import { prisma } from '@/lib/db'
import { EmbeddingService } from '@/lib/knowledge/embedding-service'

export class KnowledgeService {
  /**
   * Obtiene todos los artículos con filtros opcionales
   */
  static async getArticles(tenantId: string, filters: { category?: string; query?: string } = {}) {
    const where: any = { tenantId };
    
    if (filters.category) {
      where.category = filters.category;
    }

    if (filters.query) {
      where.OR = [
        { title: { contains: filters.query, mode: 'insensitive' } },
        { content: { contains: filters.query, mode: 'insensitive' } },
        { tags: { has: filters.query } }
      ];
    }

    return await prisma.knowledgeArticle.findMany({
      where,
      orderBy: { updatedAt: 'desc' }
    });
  }

  /**
   * Búsqueda semántica real usando embeddings vectoriales.
   *
   * Pipeline:
   * 1. Obtiene todos los artículos del tenant
   * 2. Busca los que tienen embedding (vectorId != null)
   * 3. Genera embedding de la query
   * 4. Calcula cosine similarity contra cada artículo
   * 5. Si hay suficientes resultados semánticos (>0), los retorna
   * 6. Si no, fallback a búsqueda textual
   *
   * @returns Artículos ordenados por relevancia semántica
   */
  static async searchSemantic(tenantId: string, query: string) {
    // Obtener todos los artículos públicos del tenant
    const allArticles = await prisma.knowledgeArticle.findMany({
      where: { tenantId, isPublic: true },
      select: {
        id: true,
        title: true,
        content: true,
        category: true,
        tags: true,
        vectorId: true,
      },
    })

    if (allArticles.length === 0) return []

    const articlesWithEmbeddings = allArticles.filter(a => a.vectorId)

    // Si hay artículos con embeddings, usar búsqueda semántica
    if (articlesWithEmbeddings.length > 0) {
      try {
        const semanticResults = await EmbeddingService.searchArticles(
          query,
          articlesWithEmbeddings,
          5,
          0.3
        )

        if (semanticResults.length > 0) {
          return semanticResults
        }
      } catch (error) {
        console.warn('[KnowledgeService] Búsqueda semántica falló, usando fallback textual:', error)
      }
    }

    // Fallback: búsqueda textual simple
    const textualResults = EmbeddingService.searchTextual(query, allArticles, 5)
    return textualResults
  }

  /**
   * Crea un nuevo artículo de conocimiento.
   * Genera automáticamente el embedding vectorial para búsqueda semántica.
   */
  static async createArticle(tenantId: string, data: any) {
    // Generar embedding en background (no bloquea la creación)
    let vectorId: string | undefined
    try {
      vectorId = await EmbeddingService.generateForArticle(data.title, data.content)
    } catch (error) {
      console.warn('[KnowledgeService] No se pudo generar embedding para artículo:', error)
    }

    return await prisma.knowledgeArticle.create({
      data: {
        ...data,
        tenantId,
        tags: data.tags || [],
        vectorId,
      }
    });
  }

  /**
   * Actualiza un artículo y regenera su embedding.
   * Requiere tenantId para evitar cross-tenant modification.
   */
  static async updateArticle(tenantId: string, id: string, data: { title?: string; content?: string; category?: string; tags?: string[]; isPublic?: boolean }) {
    // Verificar que el artículo pertenece al tenant
    const existing = await prisma.knowledgeArticle.findUnique({
      where: { id, tenantId },
      select: { title: true, content: true },
    })

    if (!existing) {
      throw new Error(`Artículo ${id} no encontrado para el tenant ${tenantId}`)
    }

    // Si cambió título o contenido, regenerar embedding
    let vectorId: string | undefined
    if (data.title || data.content) {
      try {
        const title = data.title || existing.title
        const content = data.content || existing.content
        vectorId = await EmbeddingService.generateForArticle(title, content)
      } catch (error) {
        console.warn('[KnowledgeService] No se pudo regenerar embedding:', error)
      }
    }

    return await prisma.knowledgeArticle.update({
      where: { id, tenantId },
      data: {
        ...data,
        ...(vectorId ? { vectorId } : {}),
      },
    })
  }

  /**
   * Crea o actualiza un artículo de conocimiento
   */
  static async upsertArticle(data: {
    tenantId: string;
    title: string;
    content: string;
    category: 'POLICY' | 'SOP' | 'CULTURE' | 'TECHNICAL';
    authorId: string;
    tags?: string[];
  }) {
    return await prisma.knowledgeArticle.create({
      data: {
        ...data,
        tags: data.tags || []
      }
    })
  }

  /**
   * Busca ítems del catálogo visibles para el chatbot.
   *
   * Pipeline:
   * 1. Consulta CatalogoItem con visibleInChatbot=true y activo=true
   * 2. Filtra por coincidencia textual contra nombre, descripcion, categorias, etiquetas
   * 3. Retorna resultados formateados compatibles con el pipeline de RAG
   *    (misma estructura que KB articles: { id, title, content, category, tags })
   *
   * El contenido incluye precio, moneda y tipo para que el LLM tenga contexto completo.
   */
  static async searchCatalogItems(tenantId: string, query: string) {
    const items = await prisma.catalogoItem.findMany({
      where: {
        tenantId,
        activo: true,
        visibleInChatbot: true,
      },
      select: {
        id: true,
        nombre: true,
        descripcion: true,
        tipo: true,
        precioBase: true,
        moneda: true,
        categorias: true,
        etiquetas: true,
        duracionMinutos: true,
        modalidad: true,
      },
      orderBy: [{ destacado: 'desc' }, { nombre: 'asc' }],
    })

    if (items.length === 0) return []

    const queryLower = query.toLowerCase()

    // Filtrar y rankear por relevancia textual
    const scored = items.map(item => {
      let score = 0
      const nombre = (item.nombre || '').toLowerCase()
      const descripcion = (item.descripcion || '').toLowerCase()
      const categorias = (item.categorias || []).join(' ').toLowerCase()
      const etiquetas = (item.etiquetas || []).join(' ').toLowerCase()
      const tipo = (item.tipo || '').toLowerCase()

      // Palabras clave de la query
      const queryWords = queryLower.split(/\s+/).filter(w => w.length > 1)

      for (const word of queryWords) {
        if (nombre.includes(word)) score += 10
        if (descripcion.includes(word)) score += 5
        if (categorias.includes(word)) score += 3
        if (etiquetas.includes(word)) score += 3
        if (tipo === word) score += 8
      }

      // Bonus por match exacto
      if (nombre === queryLower) score += 20
      if (nombre.includes(queryLower)) score += 15

      // Construir contenido legible para el LLM
      const contentParts: string[] = []
      if (item.descripcion) contentParts.push(item.descripcion)
      contentParts.push(`Precio: ${item.precioBase} ${item.moneda || 'EUR'}`)
      if (item.duracionMinutos) contentParts.push(`Duración: ${item.duracionMinutos} min`)
      if (item.modalidad) contentParts.push(`Modalidad: ${item.modalidad}`)
      if (item.categorias?.length) contentParts.push(`Categorías: ${item.categorias.join(', ')}`)

      return {
        id: item.id,
        title: item.nombre,
        content: contentParts.join('. '),
        category: item.tipo,
        tags: [...(item.categorias || []), ...(item.etiquetas || [])],
        _score: score,
      }
    })

    // Filtrar solo resultados con score > 0 y ordenar por score descendente
    const relevant = scored
      .filter(s => s._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, 5)

    // Remover el campo interno _score antes de retornar
    return relevant.map(({ _score, ...rest }) => rest)
  }

  /**
   * Busca artículos por contexto o tags (Legacy)
   */
  static async searchKnowledge(tenantId: string, query: string) {
    return await this.getArticles(tenantId, { query });
  }

  /**
   * Obtiene artículos por categoría de Hub (Contextual)
   */
  static async getContextualArticles(tenantId: string, hub: string) {
    const hubMap: Record<string, string[]> = {
      'ventas': ['SALES', 'PIPELINE', 'CRM'],
      'finanzas': ['FINANCE', 'ACCOUNTING', 'TAX'],
      'rrhh': ['HR', 'PAYROLL', 'RECRUITING'],
      'produccion': ['SOP', 'INDUSTRIAL', 'BOM']
    }

    const tags = hubMap[hub.toLowerCase()] || []
    
    return await prisma.knowledgeArticle.findMany({
      where: {
        tenantId,
        tags: { hasSome: tags }
      },
      take: 3
    })
  }
}
