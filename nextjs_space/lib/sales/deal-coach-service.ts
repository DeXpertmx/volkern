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
        messageDrafts: { take: 3, orderBy: { fechaCreacion: 'desc' } }
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

    const messages: GemmaMessage[] = [{ role: 'system', content: systemPrompt }];
    const aiRes = await callGemma(messages, { responseMimeType: 'application/json' });

    if (aiRes.error) throw new Error(`Error de IA: ${aiRes.error}`);

    const advice = JSON.parse(aiRes.content);

    // 3. Sincronizar Salud Técnica
    const healthResult = await PipelineHealthService.updateDealHealth(dealId);

    // 4. Modo Autopiloto: Ejecutar acciones si está activado Y confianza es alta
    const autopilot = await ActionOrchestrator.isAutopilotEnabled(tenantId);
    if (autopilot) {
      for (const step of advice.successPath) {
        if (step.action) {
          await ActionOrchestrator.executeAction(step.action.type, dealId, tenantId, step.action.payload, {
            rationale: advice.rationale,
            confidence: advice.confidenceScore,
            evidence: advice.evidencePoints
          });
        }
      }
      if (advice.suggestedDraft) {
        await ActionOrchestrator.executeAction('GENERATE_DRAFT', dealId, tenantId, advice.suggestedDraft, {
          rationale: advice.rationale,
          confidence: advice.confidenceScore,
          evidence: advice.evidencePoints
        });
      }
    }

    // 5. Persistir Sabiduría en el Deal
    await prisma.deal.update({
      where: { id: dealId },
      data: {
        aiStrategy: JSON.stringify(advice.successPath),
        aiSentiment: advice.sentiment,
        aiDetectedPain: advice.detectedPains.join(','),
        aiNextBestAction: advice.successPath[0],
        aiGhostingRisk: advice.ghostingRisk,
        lastAiConsult: new Date()
      }
    });

    return {
      healthScore: healthResult?.healthScore || 0,
      sentiment: advice.sentiment,
      detectedPains: advice.detectedPains,
      successPath: advice.successPath,
      objections: advice.objections,
      ghostingRisk: advice.ghostingRisk,
      drafts: deal.messageDrafts
    };
  }
}
