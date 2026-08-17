import { prisma } from '@/lib/db';

/**
 * Registra un evento en el timeline del contrato. Nunca lanza: si falla,
 * loguea y continúa para no romper el flujo principal (creación, firma, pago).
 */
export async function addContratoTimelineEvent(params: {
  contratoId: string;
  action: string;
  note?: string | null;
  actorId?: string | null;
  actorType?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    await prisma.contratoTimeline.create({
      data: {
        contratoId: params.contratoId,
        actorId: params.actorId || null,
        actorType: params.actorType || 'SYSTEM',
        action: params.action,
        note: params.note || null,
        metadata: (params.metadata || {}) as any
      }
    });
  } catch (error: any) {
    console.warn(`[ContratoTimeline] No se pudo registrar evento ${params.action} para ${params.contratoId}:`, error.message);
  }
}
