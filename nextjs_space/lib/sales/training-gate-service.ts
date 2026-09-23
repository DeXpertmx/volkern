import { prisma } from '@/lib/db';
import {
  ETIQUETA_PUERTA,
  activarEtiqueta,
  desactivarEtiqueta,
  debeAbrirPuerta,
  encargoDePractica,
  puertaActivaEnEtiquetas,
  levantaLaPuerta,
} from './training-gate';
import { createSystemContext } from '@/lib/skills/context';

/**
 * Servicio del bucle riesgo → roleplay.
 *
 * Dos piezas, un ciclo:
 *
 *  ABRIR — lo llama el pipeline-watchdog justo después de recalcular salud:
 *  si un deal activo cayó a CRÍTICO y aún no tiene la puerta, se marca con la
 *  etiqueta-puerta (`Deal.tags`, sin migración), se notifica al vendedor
 *  asignado y se emite el evento `TRAINING_REQUIRED` (nuevo, tipado y
 *  documentado en lib/types/events.ts) para que las automatizaciones del
 *  tenant puedan reaccionar.
 *
 *  CERRAR — lo llama `generatePostMortem` (training-skills) al terminar una
 *  práctica: si la puntuación alcanzó el mínimo (la misma constante del
 *  módulo puro) y el deal tenía la puerta, se quita la etiqueta, se registra
 *  la actividad de cierre en la línea de tiempo y se emite `TRAINING_COMPLETED`
 *  — el evento que `automation-listener` ya escuchaba y nadie emitía.
 *
 * Nota sobre el evento: el listener mapea `trainingId`/`employeeId` desde el
 * payload tipado de formación (`evaluationId`, `employeeId`), así que la
 * emisión usa ESOS nombres de campo para que el contexto llegue completo.
 */

export interface AperturaResultado {
  abiertas: number;
  detalles: Array<{ dealId: string; yaEstaba: boolean }>;
}

export class TrainingGateService {
  /** Abre la puerta en los deals activos que acaban de caer a CRÍTICO (idempotente). */
  static async abrirPuertas(tenantId: string): Promise<AperturaResultado> {
    const criticos = await prisma.deal.findMany({
      where: { tenantId, estado: 'activo', healthStatus: 'CRITICAL' },
      select: {
        id: true,
        tenantId: true,
        titulo: true,
        valor: true,
        moneda: true,
        leadId: true,
        healthScore: true,
        tags: true,
        usuarioAsignadoId: true,
      },
    });

    const detalles: AperturaResultado['detalles'] = [];
    let abiertas = 0;

    for (const deal of criticos) {
      if (puertaActivaEnEtiquetas(deal.tags)) {
        detalles.push({ dealId: deal.id, yaEstaba: true });
        continue; // idempotente: no re-notificar ni re-emitir
      }

      await prisma.deal.update({
        where: { id: deal.id },
        data: { tags: activarEtiqueta(deal.tags) },
      });

      const encargo = encargoDePractica(deal);
      if (encargo && deal.usuarioAsignadoId) {
        const { notifyUser } = await import('@/lib/skills/notification-layer');
        await notifyUser(
          deal.usuarioAsignadoId,
          '🎓 Practica antes de contactar',
          encargo.motivo(),
          { tenantId, correlationId: `training_gate_open_${deal.id}` }
        ).catch(err => console.error('[TrainingGate] Error notificando apertura:', err));
      }

      const { eventBus, EVENTS } = await import('@/lib/skills/event-bus');
      eventBus.emitEvent(EVENTS.TRAINING_REQUIRED, {
        tenantId,
        timestamp: new Date(),
        source: 'automation',
        evaluationId: `gate_${deal.id}`,
        employeeId: deal.usuarioAsignadoId ?? '',
        employeeNombre: encargo ? encargo.titulo : deal.titulo,
      });

      detalles.push({ dealId: deal.id, yaEstaba: false });
      abiertas += 1;
    }

    return { abiertas, detalles };
  }

  /**
   * Al terminar una práctica: si el score alcanza el mínimo, levanta la
   * puerta del deal de esa sesión (si la tenía) y deja rastro en la línea
   * de tiempo. Idempotente: sin puerta activa no toca nada.
   */
  static async cerrarPuertaSiAlcanza(params: {
    tenantId: string;
    userId: string;
    leadId: string;
    score: number;
  }): Promise<{ cerrada: boolean; dealId: string | null }> {
    if (!levantaLaPuerta(params.score)) {
      return { cerrada: false, dealId: null };
    }

    const deal = await prisma.deal.findFirst({
      where: { tenantId: params.tenantId, leadId: params.leadId, estado: 'activo' },
      select: { id: true, titulo: true, tags: true },
    });
    if (!deal || !puertaActivaEnEtiquetas(deal.tags)) {
      return { cerrada: false, dealId: deal?.id ?? null };
    }

    await prisma.deal.update({
      where: { id: deal.id },
      data: { tags: desactivarEtiqueta(deal.tags) },
    });

    await prisma.dealActivity.create({
      data: {
        dealId: deal.id,
        tenantId: params.tenantId,
        userId: params.userId,
        tipo: 'nota',
        titulo: `🎓 Práctica superada (${params.score}/100)`,
        descripcion: `La puerta de contacto se levanta: la sesión de práctica alcanzó ${params.score} puntos (mínimo requerido 70). La conversación se ensayó con los datos reales de este cliente.`,
        metadata: { origen: 'training_gate', score: params.score },
      },
    });

    return { cerrada: true, dealId: deal.id };
  }

  /** Estado de la puerta para API/UI: ficha del deal y bloqueo de actividades. */
  static async estado(tenantId: string, dealId: string) {
    const deal = await prisma.deal.findFirst({
      where: { id: dealId, tenantId },
      select: { id: true, tags: true, healthStatus: true, healthScore: true, leadId: true, titulo: true },
    });
    if (!deal) return null;
    return {
      activa: puertaActivaEnEtiquetas(deal.tags),
      healthStatus: deal.healthStatus,
      healthScore: deal.healthScore,
      leadId: deal.leadId,
      titulo: deal.titulo,
    };
  }
}
