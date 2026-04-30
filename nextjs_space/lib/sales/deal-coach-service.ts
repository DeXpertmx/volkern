import { prisma } from '@/lib/db';
import { callGemma, GemmaMessage } from '@/lib/ai/gemma-client';
import { PipelineHealthService } from './pipeline-health-service';
import { ActionOrchestrator } from './action-orchestrator';

export interface DealCoachAdvice {
  healthScore: number;
  sentiment: 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE' | 'URGENT';
  detectedPains: string[];
  successPath: { title: string; description: string; why: string; action?: any }[];
  objections: { trigger: string; counter: string }[];
  ghostingRisk: number;
  inventoryAlert?: string;
  drafts?: any[];
  rationale?: string;
  confidenceScore?: number;
  evidencePoints?: string[];
}

export class DealCoachService {
  /**
   * Genera asesoría táctica integral para un Deal
   */
  static async getDealAdvice(dealId: string, tenantId: string): Promise<DealCoachAdvice> {
    // 1. Recuperar contexto completo
    const deal = await prisma.deal.findUnique({
      where: { id: dealId },
      include: {
        actividades: { orderBy: { fechaCreacion: 'desc' }, take: 10 },
        lead: { include: { notasTimestamp: { orderBy: { fechaCreacion: 'desc' }, take: 10 } } },
        contact: true,
        company: true,
        MessageDraft: { take: 3, orderBy: { fechaCreacion: 'desc' } }
      }
    });

    if (!deal) throw new Error('Deal no encontrado');

    // 2. Preparar el prompt para Gemma
    const notas = deal.lead?.notasTimestamp.map(n => n.contenido).join('\n') || '';
    const actividades = deal.actividades.map(a => `${a.tipo}: ${a.titulo}`).join('\n') || '';

    const systemPrompt = `
Eres Gemma Deal Coach, un estratega de ventas experto.
Tu misión es analizar el historial de este trato y proporcionar asesoría táctica para el cierre.

CONTEXTO DEL TRATO:
- Título: ${deal.titulo}
- Valor: ${deal.valor} ${deal.moneda}
- Etapa Actual: ${deal.etapa}
- Historial de Notas:
${notas}
- Actividades Recientes:
${actividades}

RESPONDE ÚNICAMENTE EN JSON CON ESTE FORMATO:
{
  "sentiment": "POSITIVE | NEUTRAL | NEGATIVE | URGENT",
  "detectedPains": ["lista de dolores detectados"],
  "rationale": "Breve explicación estratégica de tus recomendaciones",
  "confidenceScore": 0.0 a 1.0,
  "evidencePoints": ["punto 1 de datos", "punto 2"],
  "successPath": [
    {
      "title": "Paso 1", 
      "description": "acción", 
      "why": "razonamiento estratégico",
      "action": {"type": "CREATE_TASK", "payload": {"titulo": "...", "descripcion": "..."}}
    }
  ],
  "objections": [
    {"trigger": "objeción probable", "counter": "contra-argumento ganador"}
  ],
  "ghostingRisk": 0.0 a 1.0,
  "suggestedDraft": {"canal": "email", "asunto": "...", "contenido": "..."}
}
    `.trim();

    const messages: GemmaMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: 'Analiza este trato y proporciona tu asesoría estratégica en el formato JSON solicitado.' }
    ];
    
    const aiRes = await callGemma(messages, { responseMimeType: 'application/json' });

    if (aiRes.error) throw new Error(`Error de IA: ${aiRes.error}`);

    let advice: any;
    try {
      advice = JSON.parse(aiRes.content);
    } catch (e) {
      console.error('[DealCoach] Fallo al parsear JSON de Gemma:', aiRes.content);
      throw new Error('Gemma devolvió un formato no válido');
    }

    // 3. Sincronizar Salud Técnica
    let healthResult;
    try {
      healthResult = await PipelineHealthService.updateDealHealth(dealId);
    } catch (e) {
      console.error('[DealCoach] Error actualizando salud:', e);
    }

    // 4. Modo Autopiloto: Ejecutar acciones si está activado Y confianza es alta
    try {
      const autopilot = await ActionOrchestrator.isAutopilotEnabled(tenantId);
      if (autopilot) {
        for (const step of advice.successPath || []) {
          if (step.action && step.action.payload?.titulo) {
            await ActionOrchestrator.executeAction(step.action.type, dealId, tenantId, step.action.payload, {
              rationale: advice.rationale,
              confidence: advice.confidenceScore || 0.5,
              evidence: advice.evidencePoints || []
            });
          }
        }
        if (advice.suggestedDraft) {
          await ActionOrchestrator.executeAction('GENERATE_DRAFT', dealId, tenantId, advice.suggestedDraft, {
            rationale: advice.rationale,
            confidence: advice.confidenceScore || 0.5,
            evidence: advice.evidencePoints || []
          });
        }
      }
    } catch (e) {
      console.error('[DealCoach] Error en Autopiloto:', e);
    }

    // 5. Persistir Sabiduría en el Deal
    try {
      await prisma.deal.update({
        where: { id: dealId },
        data: {
          aiStrategy: JSON.stringify(advice.successPath),
          aiSentiment: advice.sentiment,
          aiDetectedPain: advice.detectedPains?.join(','),
          aiNextBestAction: advice.successPath?.[0] || null,
          aiGhostingRisk: advice.ghostingRisk,
          lastAiConsult: new Date()
        }
      });
    } catch (e) {
      console.error('[DealCoach] Error persistiendo estrategia:', e);
    }

    return {
      healthScore: healthResult?.healthScore || 0,
      sentiment: advice.sentiment || 'NEUTRAL',
      detectedPains: advice.detectedPains || [],
      successPath: advice.successPath || [],
      objections: advice.objections || [],
      ghostingRisk: advice.ghostingRisk || 0,
      drafts: (deal as any).MessageDraft || [],
      rationale: advice.rationale,
      confidenceScore: advice.confidenceScore,
      evidencePoints: advice.evidencePoints
    };
  }
}
