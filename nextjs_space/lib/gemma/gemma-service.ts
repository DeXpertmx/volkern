import { prisma } from '@/lib/db';
import { ConnectService } from '@/lib/connect/connect-service';

export interface GemmaSuggestion {
  suggestionId: string;
  type: 'reconciliation_suggestion' | 'integrity_alert' | 'summary' | 'action_recommendation';
  message: string;
  confidence: number;
  evidence: any[];
  suggestedActions: any[];
}

export class GemmaService {
  /**
   * Procesa y persiste una respuesta de Gemma, publicándola en el canal correspondiente.
   */
  static async processGemmaResponse(tenantId: string, event: string, requestPayload: any, gemmaOutput: GemmaSuggestion) {
    console.log('[GemmaService] Iniciando processGemmaResponse...');
    return await prisma.$transaction(async (tx) => {
      // 1. Persistir el Request
      console.log('[GemmaService] Creando GemmaRequest...');
      const request = await tx.gemmaRequest.create({
        data: {
          tenantId,
          event,
          payload: requestPayload
        }
      });

      // 2. Persistir la Respuesta
      console.log('[GemmaService] Creando GemmaResponse...');
      const response = await tx.gemmaResponse.create({
        data: {
          tenantId,
          gemmaRequestId: request.id,
          suggestionId: gemmaOutput.suggestionId,
          type: gemmaOutput.type,
          message: gemmaOutput.message,
          confidence: gemmaOutput.confidence,
          evidence: gemmaOutput.evidence as any,
          suggestedActions: gemmaOutput.suggestedActions as any,
          payload: gemmaOutput as any
        }
      });

      // 3. Determinar canal de destino basado en el tipo de sugerencia
      let channelName = 'General';
      if (gemmaOutput.type === 'reconciliation_suggestion') channelName = 'Finanzas';
      if (gemmaOutput.type === 'integrity_alert') channelName = 'Finanzas'; 

      // 4. Publicar en Connect como mensaje de sistema con metadatos
      console.log(`[GemmaService] Asegurando canal ${channelName}...`);
      const channel = await ConnectService.ensureSystemChannel(tenantId, channelName, tx);
      
      console.log('[GemmaService] Insertando ChatMessage...');
      await tx.chatMessage.create({
        data: {
          tenantId,
          channelId: channel.id,
          senderId: null, // Sistema (Gemma)
          content: gemmaOutput.message,
          isSystemMessage: true,
          metadata: {
            isGemmaSuggestion: true,
            suggestionId: response.id,
            type: gemmaOutput.type,
            confidence: gemmaOutput.confidence,
            suggestedActions: gemmaOutput.suggestedActions,
            evidence: gemmaOutput.evidence
          }
        }
      });

      console.log('[GemmaService] Proceso completado con éxito.');
      return response;
    });
  }

  /**
   * Ejecuta una acción sugerida por Gemma
   * Requiere validación de seguridad y firma del operador (Trust Protocol)
   */
  static async executeAction(suggestionId: string, actionId: string, operatorId: string, operatorNote: string) {
    // Implementación de Fase 2
    return await prisma.$transaction(async (tx) => {
      const suggestion = await tx.gemmaResponse.findUnique({
        where: { id: suggestionId }
      });

      if (!suggestion || suggestion.status !== 'pending') {
        throw new Error('Sugerencia no válida o ya procesada');
      }

      // 1. Marcar como ejecutado
      await tx.gemmaResponse.update({
        where: { id: suggestionId },
        data: { status: 'executed' }
      });

      // 2. Registrar en Auditoría (Trust Protocol)
      await tx.auditLog.create({
        data: {
          tenantId: suggestion.tenantId,
          userId: operatorId,
          accion: `GEMMA_ACTION_EXECUTED:${actionId}`,
          entidad: 'GemmaSuggestion',
          entidadId: suggestionId,
          descripcion: `Acción ejecutada: ${actionId}. Nota del operador: ${operatorNote}`,
          cambiosAntes: suggestion.payload as any,
          cambiosDespues: { actionId, operatorId, timestamp: new Date() }
        }
      });

      return { success: true };
    });
  }

  /**
   * Genera una respuesta contextual para el Volkern Guide (IA RAG)
   */
  static async getContextualGuideResponse(tenantId: string, userId: string, hub: string, query: string) {
    // 1. Obtener artículos relevantes del Knowledge Hub
    const contextArticles = await prisma.knowledgeArticle.findMany({
      where: {
        tenantId,
        OR: [
          { content: { contains: query, mode: 'insensitive' } },
          { tags: { hasSome: [hub.toUpperCase()] } }
        ]
      },
      take: 2
    });

    const knowledgeContext = contextArticles.map(a => `[Fuente: ${a.title}]: ${a.content}`).join('\n');

    // 2. Simulación de llamada a Gemma con RAG
    const gemmaResponse = `Basado en el Hub de ${hub} y nuestras políticas internas: ${
      knowledgeContext ? 'He encontrado información relevante en el Knowledge Hub.' : 'No he encontrado un SOP específico, pero puedo asistirte con el flujo general.'
    } Tu consulta sobre "${query}" se resuelve siguiendo estos pasos... [Respuesta Generada por Gemma]`;

    // 3. Registrar en Trust Protocol (UserGuidanceLog)
    const log = await prisma.userGuidanceLog.create({
      data: {
        tenantId,
        userId,
        hub,
        query,
        response: gemmaResponse
      }
    });

    return {
      id: log.id,
      response: gemmaResponse,
      sources: contextArticles.map(a => ({ id: a.id, title: a.title }))
    };
  }
}
