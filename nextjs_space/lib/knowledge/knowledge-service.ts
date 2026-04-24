import { prisma } from '@/lib/db';
import { callGemma, GemmaMessage } from '@/lib/ai/gemma-client';

export interface KnowledgeArticleData {
  title: string;
  content: string;
  category: 'POLICY' | 'SOP' | 'CULTURE' | 'TECHNICAL';
  tags?: string[];
  isPublic?: boolean;
  authorId: string;
}

export class KnowledgeService {
  /**
   * Obtiene artículos con filtros
   */
  static async getArticles(tenantId: string, filters: { category?: string; query?: string; isPublic?: boolean } = {}) {
    const { category, query, isPublic } = filters;
    
    const where: any = { tenantId };
    if (category) where.category = category;
    if (isPublic !== undefined) where.isPublic = isPublic;
    
    if (query) {
      where.OR = [
        { title: { contains: query, mode: 'insensitive' } },
        { content: { contains: query, mode: 'insensitive' } },
        { tags: { hasSome: [query] } }
      ];
    }

    return await prisma.knowledgeArticle.findMany({
      where,
      orderBy: { updatedAt: 'desc' }
    });
  }

  /**
   * Crea un nuevo artículo con asistencia de Gemma
   */
  static async createArticle(tenantId: string, data: KnowledgeArticleData) {
    // 1. Enriquecer con IA si el contenido es crudo o falta resumen
    const enrichedData = await this.enrichWithIA(data);

    return await prisma.knowledgeArticle.create({
      data: {
        tenantId,
        ...enrichedData,
        tags: enrichedData.tags || []
      }
    });
  }

  /**
   * Usa Gemma para categorizar y etiquetar contenido
   */
  private static async enrichWithIA(data: KnowledgeArticleData) {
    const systemPrompt = `
      Eres el Bibliotecario de Volkern. Tu misión es analizar el contenido de un artículo y devolver:
      1. Sugerencias de etiquetas (tags) relevantes.
      2. Una categoría sugerida (POLICY, SOP, CULTURE, TECHNICAL).
      
      Responde ÚNICAMENTE en JSON:
      {
        "suggestedTags": ["tag1", "tag2"],
        "suggestedCategory": "SOP"
      }
    `;

    const messages: GemmaMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `TÍTULO: ${data.title}\nCONTENIDO: ${data.content.substring(0, 2000)}` }
    ];

    const aiRes = await callGemma(messages, { responseMimeType: 'application/json' });

    if (!aiRes.error) {
      try {
        const cleaned = aiRes.content.replace(/```json/g, '').replace(/```/g, '').trim();
        const parsed = JSON.parse(cleaned);
        return {
          ...data,
          tags: [...(data.tags || []), ...(parsed.suggestedTags || [])],
          category: data.category || parsed.suggestedCategory
        };
      } catch (e) {
        console.error('[KnowledgeService] Error parsing AI enrichment:', e);
      }
    }

    return data;
  }

  /**
   * Búsqueda semántica (Simulada con Gemma re-ranking)
   */
  static async searchSemantic(tenantId: string, query: string) {
    // 1. Búsqueda keyword básica
    const baseArticles = await this.getArticles(tenantId, { query });
    
    if (baseArticles.length === 0) return [];

    // 2. Re-ranking con Gemma para encontrar el más relevante
    const context = baseArticles.map((a, i) => `[${i}] ${a.title}: ${a.content.substring(0, 100)}`).join('\n');
    
    const systemPrompt = `
      Eres el Guía de Volkern. Analiza la consulta del usuario y el contexto de artículos disponibles.
      Dime cuál es el índice del artículo más relevante.
      Responde SOLO con el número del índice. Si ninguno es relevante, responde "NONE".
    `;

    const messages: GemmaMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `CONSULTA: ${query}\n\nARTÍCULOS:\n${context}` }
    ];

    const aiRes = await callGemma(messages);
    
    if (!aiRes.error && aiRes.content.trim() !== 'NONE') {
      const index = parseInt(aiRes.content.trim());
      if (!isNaN(index) && baseArticles[index]) {
        return [baseArticles[index], ...baseArticles.filter((_, i) => i !== index)];
      }
    }

    return baseArticles;
  }

  /**
   * Registra una interacción de guía para telemetría
   */
  static async logGuidance(tenantId: string, data: { userId: string; hub: string; query: string; response: string }) {
    return await prisma.userGuidanceLog.create({
      data: {
        tenantId,
        ...data
      }
    });
  }
}
