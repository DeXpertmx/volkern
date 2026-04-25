import { prisma } from '@/lib/db'

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
   * Búsqueda semántica (Mock de búsqueda vectorial por ahora)
   */
  static async searchSemantic(tenantId: string, query: string) {
    // En el futuro esto integraría con un vector store
    return await this.getArticles(tenantId, { query });
  }

  /**
   * Crea un nuevo artículo
   */
  static async createArticle(tenantId: string, data: any) {
    return await prisma.knowledgeArticle.create({
      data: {
        ...data,
        tenantId,
        tags: data.tags || []
      }
    });
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
