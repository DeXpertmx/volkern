import { prisma } from '@/lib/db';
import { createSystemContext } from '@/lib/skills/context';

export class ActionOrchestrator {
  /**
   * Ejecuta una acción sugerida por Gemma con Guardrails de Confianza
   */
  static async executeAction(actionType: string, dealId: string, tenantId: string, payload: any, metadata: { rationale: string, confidence: number, evidence: any }) {
    console.log(`[ActionOrchestrator] Evaluando ${actionType} para Deal ${dealId} (Confianza: ${metadata.confidence})`);

    // 1. Guardrail de Confianza: Si es < 70%, forzar Copiloto (bloquear ejecución automática)
    const isAuto = metadata.confidence >= 0.7;
    
    const deal = await prisma.deal.findUnique({
      where: { id: dealId },
      include: { lead: true }
    });

    if (!deal) throw new Error('Deal no encontrado');

    let result;
    let outcome = 'Sugerido (Requiere aprobación)';

    // Solo ejecutar si tenemos suficiente confianza
    if (isAuto) {
      outcome = 'Ejecutado automáticamente';
      switch (actionType) {
        case 'CREATE_TASK':
          result = await prisma.task.create({
            data: {
              tenantId,
              dealId,
              leadId: deal.leadId,
              tipo: payload.tipo || 'followup',
              titulo: payload.titulo,
              descripcion: `${payload.descripcion}\n\n[IA Rationale]: ${metadata.rationale}`,
              fechaVencimiento: new Date(Date.now() + (payload.delayHours || 24) * 60 * 60 * 1000),
              prioridad: payload.prioridad || 'media'
            } as any
          });
          break;

        case 'GENERATE_DRAFT':
          result = await prisma.messageDraft.create({
            data: {
              tenantId,
              dealId,
              leadId: deal.leadId,
              canal: payload.canal || 'email',
              asunto: payload.asunto,
              contenido: payload.contenido,
              metadatos: { generatedBy: 'Gemma 4', sentiment: deal.aiSentiment, confidence: metadata.confidence }
            } as any
          });
          break;

        case 'ESCALATE_DEAL':
          const { notifyByTelegram } = await import('@/lib/skills/notification-layer');
          await notifyByTelegram(
            `🚩 *ESCALACIÓN CRÍTICA*\nEl Deal "${deal.titulo}" ha sido escalado.\nRazonamiento: ${metadata.rationale}`,
            createSystemContext(tenantId)
          );
          
          result = await prisma.auditLog.create({
            data: {
              tenantId,
              accion: 'escalar',
              entidad: 'deal',
              entidadId: dealId,
              descripcion: `Gemma escaló el deal. Rationale: ${metadata.rationale}`
            }
          });
          break;
      }
    }

    // 2. Registrar Decisión (Explicabilidad)
    await prisma.aiDecisionLog.create({
      data: {
        tenantId,
        dealId,
        actionType,
        decisionOutcome: outcome,
        rationale: metadata.rationale,
        evidence: metadata.evidence,
        confidence: metadata.confidence,
        isAutoExecuted: isAuto
      } as any
    });

    return { result, isAutoExecuted: isAuto, outcome };
  }

  /**
   * Verifica si el tenant tiene activado el Autopiloto
   */
  static async isAutopilotEnabled(tenantId: string): Promise<boolean> {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { aiAutopilot: true }
    });
    return tenant?.aiAutopilot || false;
  }
}
