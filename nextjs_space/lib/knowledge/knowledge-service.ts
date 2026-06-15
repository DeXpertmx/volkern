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
