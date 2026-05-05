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
    * Lee documentación del sistema desde archivos locales
    */
  private static async getDocumentationContext(query: string, hub: string): Promise<string[]> {
    const fs = require('fs');
    const path = require('path');
    
    const docsDirs = [
      path.join(process.cwd(), 'documentacion_comercial'),
      path.join(process.cwd(), 'documentacion_tecnica'),
      path.join(process.cwd(), 'manuales_operativos'),
    ];

    const relevantDocs: string[] = [];
    const searchTerms = query.toLowerCase().split(' ').filter((t: string) => t.length > 3);
    const hubKeywords = hub.toLowerCase().split(' ');

    for (const dir of docsDirs) {
      if (!fs.existsSync(dir)) continue;
      
      const files = fs.readdirSync(dir).filter(f => f.endsWith('.md'));
      
      for (const file of files) {
        const filePath = path.join(dir, file);
        const content = fs.readFileSync(filePath, 'utf-8');
        const lowerContent = content.toLowerCase();
        
        // Buscar coincidencias
        const queryMatch = searchTerms.some((term: string) => lowerContent.includes(term));
        const hubMatch = hubKeywords.some((keyword: string) => 
          lowerContent.includes(keyword) || 
          file.toLowerCase().includes(keyword)
        );
        
        if (queryMatch || hubMatch) {
          // Extraer primeras líneas relevantes
          const lines = content.split('\n').filter(l => l.trim() && !l.startsWith('#'));
          const snippet = lines.slice(0, 5).join(' ').substring(0, 300);
          relevantDocs.push(`📄 ${file.replace('.md', '')}: ${snippet}...`);
        }
      }
    }

    // Si no hay resultados específicos, devolver overview del hub
    if (relevantDocs.length === 0) {
      const hubOverviews = this.getHubOverview(hub);
      return hubOverviews;
    }

    return relevantDocs.slice(0, 5);
  }

  /**
   * Overview por defecto por Hub
   */
  private static getHubOverview(hub: string): string[] {
    const overviews: Record<string, string[]> = {
      'Ventas': [
        '📊 Hub de Ventas: Gestión de leads, pipeline, cotizaciones y contratos.',
        '📄 Manual: Usa /manuales_operativos/02_Hub_Ventas.md',
      ],
      'Finanzas': [
        '💰 Hub Financiero: Facturación, contabilidad, impuestos y reportes.',
        '📄 Manual: Usa /manuales_operativos/10_Finanzas.md',
      ],
      'RRHH': [
        '👥 Hub de RRHH: Empleados, nóminas, vacaciones y asistencia.',
        '📄 Manual: Usa /manuales_operativos/15_RRHH_Completo.md',
      ],
      'Marketing': [
        '📣 Hub de Marketing: Campañas, email, redes sociales y web creator.',
        '📄 Manual: Usa /manuales_operativos/14_Marketing.md',
      ],
      'Estrategia': [
        '📈 Strategy Hub: Cashflow, rentabilidad y recomendaciones IA.',
        '📄 Docs: Consulta documentacion_tecnica/ para análisis avanzados.',
      ],
      'default': [
        '🤖 Volkern Guide: Puedo ayudarte con información sobre cualquier módulo del sistema.',
        '📚 Consulta la documentación en: documentacion_comercial/, documentacion_tecnica/, manuales_operativos/',
      ],
    };

    return overviews[hub] || overviews['default'];
  }

  /**
   * Genera una respuesta contextual para el Volkern Guide (IA RAG)
   */
  static async getContextualGuideResponse(tenantId: string, userId: string, hub: string, query: string) {
    // 1. Buscar en documentación del sistema (siempre disponible)
    const docsContext = await this.getDocumentationContext(query, hub);
    
    // 2. Intentar obtener artículos del Knowledge Hub de la BD (opcional)
    let contextArticles: any[] = [];
    try {
      contextArticles = await prisma.knowledgeArticle.findMany({
        where: {
          tenantId,
          OR: [
            { content: { contains: query, mode: 'insensitive' } },
            { tags: { hasSome: [hub.toUpperCase()] } }
          ]
        },
        take: 2
      });
    } catch (dbError) {
      console.warn('[GemmaService] Knowledge Hub DB no disponible:', dbError);
    }

    // 3. Construir respuesta
    let gemmaResponse = '';
    
    if (docsContext.length > 0 || contextArticles.length > 0) {
      const allContext = [
        ...docsContext,
        ...contextArticles.map((a: any) => `📖 ${a.title}: ${a.content?.substring(0, 150)}...`)
      ];
      
      gemmaResponse = `He encontrado información relevante sobre "${query}" en ${hub}:\n\n${allContext.join('\n\n')}\n\n¿Te gustaría que profundice en algún punto específico?`;
    } else {
      // Respuestas predefinidas por contexto si no hay artículos específicos
      const fallbacks: Record<string, string> = {
        'Ventas': 'Para gestionar leads, ve al Hub de Ventas. Puedes calificar prospectos, registrar actividades y convertirlos en proyectos ganados. El flujo estándar requiere completar el perfil del cliente antes de la cotización.',
        'Finanzas': 'El control financiero se centraliza en el Hub Contable. Aquí puedes auditar facturas, gestionar flujos de caja y ver el estado de conciliación bancaria asistida por IA.',
        'Talento y Nóminas': 'En el área de RRHH puedes gestionar expedientes de empleados, controlar asistencias (Punch Clock) y revisar el estado de las nóminas del periodo actual.',
        'Estrategia': 'El Strategy Hub (Profitability Sniffer) te permite detectar fugas de capital y proyectos con márgenes críticos. Te recomiendo revisar el Cashflow a 90 días.',
        'Dashboard General': 'Volkern ERP es una plataforma integral de inteligencia operativa. Puedes navegar usando la barra lateral para acceder a los diferentes Hubs especializados.'
      };

      const baseInfo = fallbacks[hub] || fallbacks['Dashboard General'];
      gemmaResponse = `Hola. No he encontrado un SOP específico en el Knowledge Hub sobre "${query}", pero basándome en el contexto de ${hub}:\n\n${baseInfo}\n\n¿Hay algo más en lo que pueda apoyarte?`;
    }

    // 3. Registrar en Trust Protocol (UserGuidanceLog) - opcional
    try {
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
    } catch (logError) {
      console.warn('[GemmaService] Error guardando log:', logError);
      return {
        response: gemmaResponse,
        sources: contextArticles.map(a => ({ id: a.id, title: a.title }))
      };
    }
  }
}
