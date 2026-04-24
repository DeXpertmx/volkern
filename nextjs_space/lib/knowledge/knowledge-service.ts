import { prisma } from '@/lib/db'

export class KnowledgeService {
  /**
   * Crea o actualiza un artículo de conocimiento (SOP, Política, etc.)
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
   * Busca artículos por contexto o tags
   */
  static async searchKnowledge(tenantId: string, query: string) {
    // Implementación básica de búsqueda por palabras clave en contenido
    // En producción esto usaría búsqueda vectorial (RAG)
    return await prisma.knowledgeArticle.findMany({
      where: {
        tenantId,
        OR: [
          { title: { contains: query, mode: 'insensitive' } },
          { content: { contains: query, mode: 'insensitive' } },
          { tags: { has: query } }
        ]
      },
      take: 5,
      orderBy: { createdAt: 'desc' }
    })
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
