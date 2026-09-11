import { Worker, Job } from 'bullmq';
import { initRedis } from '../../core/redis';
import { SocialMediaService } from '../social-media-service';
import { prisma } from '../../db';
import {
  buildActionKey,
  claimActionExecution,
  completeActionExecution,
  releaseActionExecution,
} from './action-idempotency';

/**
 * Marketing Workflow Worker
 * Ejecuta las acciones individuales de una regla de automatización y
 * registra en el AutomationLog el resultado REAL de cada una (éxito o
 * fallo con su causa). Solo se inicializa si Redis está disponible.
 */
// Evita crear varios workers en el mismo proceso (hot reload, doble import).
let workflowWorkerStarted = false;

/** Resultado de una acción individual. */
export type ActionOutcome = {
  type: string;
  /** `skipped`: ya se había ejecutado para ese ámbito (idempotencia). */
  status: 'success' | 'failed' | 'skipped';
  durationMs: number;
  error?: string;
  /** Artefacto creado (tarea, limpieza...) o el que ya existía. */
  entityId?: string | null;
  /** Motivo de la omisión, cuando `status` es `skipped`. */
  reason?: string;
};

/** Resultado consolidado de la ejecución de un job. */
export type WorkflowExecutionSummary = {
  status: 'success' | 'partial' | 'failed';
  outcomes: ActionOutcome[];
  error?: string;
  durationMs: number;
};

/**
 * Ejecuta las acciones de un job y escribe el resultado real sobre el log
 * que el motor creó al encolarlas.
 *
 * No relanza los fallos de acción a propósito: un `throw` haría que BullMQ
 * reintentara el job y las acciones (crear tarea, limpieza, mensaje) no son
 * idempotentes, así que se duplicarían. El fallo queda registrado en el log.
 */
export async function processWorkflowJob(data: {
  ruleId?: string;
  tenantId: string;
  actions?: any[];
  payload: any;
  logId?: string;
  /** Id del job de la cola: permite recuperar la reclamación en un reintento. */
  jobId?: string;
}): Promise<WorkflowExecutionSummary> {
  const { ruleId, tenantId, payload, logId, jobId } = data;
  const actions: any[] = Array.isArray(data.actions) ? data.actions : [];

  await markExecutionRunning(logId);

  const outcomes: ActionOutcome[] = [];
  for (const action of actions) {
    const startedAt = Date.now();
    const tipo = action?.type || 'DESCONOCIDA';
    try {
      // Idempotencia: si esta acción ya se ejecutó para el mismo ámbito
      // (reserva/tarea/unidad) y la misma variante, no se repite.
      const built = buildActionKey(action, payload);
      let claimId: string | null = null;

      if (built) {
        const claim = await claimActionExecution({
          tenantId,
          key: built.key,
          actionType: built.actionType,
          scope: built.scope,
          jobId,
        });

        if (claim.status === 'duplicate') {
          console.log(`[WorkflowWorker] Acción omitida (ya ejecutada): ${built.key}`);
          outcomes.push({
            type: tipo,
            status: 'skipped',
            durationMs: Date.now() - startedAt,
            entityId: claim.entityId,
            reason: 'Ya se había ejecutado para esta reserva (evento repetido o regla re-evaluada)',
          });
          continue;
        }

        if (claim.status === 'claimed') claimId = claim.claimId;
      }

      let entityId: string | undefined;
      try {
        entityId = await executeAction(action, tenantId, payload);
      } catch (error) {
        // Si la acción falló, se libera la reclamación para que un intento
        // posterior pueda ejecutarla de verdad.
        if (claimId) await releaseActionExecution(claimId);
        throw error;
      }

      if (claimId) await completeActionExecution(claimId, entityId);

      outcomes.push({
        type: tipo,
        status: 'success',
        durationMs: Date.now() - startedAt,
        ...(entityId ? { entityId } : {}),
      });
    } catch (error: any) {
      const message = error?.message || String(error);
      console.error(`[WorkflowWorker] Acción fallida (${tipo}):`, message);
      outcomes.push({
        type: tipo,
        status: 'failed',
        durationMs: Date.now() - startedAt,
        error: message,
      });
    }
  }

  const fallidas = outcomes.filter((o) => o.status === 'failed');
  const status: WorkflowExecutionSummary['status'] =
    fallidas.length === 0 ? 'success' : fallidas.length === outcomes.length ? 'failed' : 'partial';

  const error = fallidas.length
    ? `${fallidas[0].type}: ${fallidas[0].error}${
        fallidas.length > 1 ? ` (y ${fallidas.length - 1} acción(es) más con error)` : ''
      }`
    : undefined;

  const summary: WorkflowExecutionSummary = {
    status,
    outcomes,
    error,
    durationMs: outcomes.reduce((total, o) => total + o.durationMs, 0),
  };

  await recordExecutionResult(logId, summary);
  console.log(
    `[WorkflowWorker] Regla ${ruleId || '-'}: ${status} (${outcomes.length} acciones, ${summary.durationMs}ms)`
  );
  return summary;
}

/** Marca la ejecución como `running` (best-effort, nunca rompe el job). */
async function markExecutionRunning(logId?: string) {
  if (!logId) return;
  try {
    await (prisma as any).automationLog.update({
      where: { id: logId },
      data: { status: 'running' },
    });
  } catch (error) {
    console.error('[WorkflowWorker] No se pudo marcar la ejecución como running:', error);
  }
}

/**
 * Escribe el desenlace real de la ejecución en el AutomationLog creado por
 * el motor al encolarla. Es el único sitio donde se escribe `success`.
 */
export async function recordExecutionResult(
  logId: string | undefined,
  summary: WorkflowExecutionSummary
) {
  if (!logId) return;

  const ok = summary.outcomes.filter((o) => o.status === 'success').length;
  const omitidas = summary.outcomes.filter((o) => o.status === 'skipped').length;
  const sufijo = omitidas > 0 ? `, ${omitidas} omitida(s) por idempotencia` : '';
  const message =
    summary.status === 'success'
      ? `Ejecutada correctamente (${ok} acción(es)${sufijo})`
      : summary.status === 'partial'
        ? `Parcial: ${ok} de ${summary.outcomes.length} acciones completadas${sufijo}`
        : 'La ejecución falló';

  try {
    await (prisma as any).automationLog.update({
      where: { id: logId },
      data: {
        status: summary.status,
        error: summary.error ?? null,
        result: {
          message,
          actions: summary.outcomes,
          durationMs: summary.durationMs,
          finishedAt: new Date().toISOString(),
        },
      },
    });
  } catch (error) {
    console.error(`[WorkflowWorker] No se pudo registrar el resultado de la ejecución ${logId}:`, error);
  }
}

export const setupWorkflowWorker = async () => {
  if (workflowWorkerStarted) return;

  const redis = await initRedis();
  if (!redis) {
    console.debug('[WorkflowWorker] Redis no disponible, worker omitido.');
    return;
  }

  workflowWorkerStarted = true;
  console.log('[WorkflowWorker] Worker escuchando la cola marketing_workflows');

  const worker = new Worker('marketing_workflows', async (job: Job) => {
    const { ruleId, tenantId, actions, payload, logId } = job.data || {};
    console.log(`[WorkflowWorker] Processing ${actions?.length ?? 0} actions for rule ${ruleId}`);
    await processWorkflowJob({
      ruleId,
      tenantId,
      actions,
      payload,
      logId,
      jobId: job.id ? String(job.id) : undefined,
    });
  }, { connection: redis });

  worker.on('completed', (job) => {
    console.log(`[WorkflowWorker] Job ${job.id} completed successfully`);
  });

  worker.on('failed', async (job, err) => {
    console.error(`[WorkflowWorker] Job ${job?.id} failed:`, err);
    // Un fallo a nivel de job (timeout, worker caído a mitad) también debe
    // quedar reflejado: sin esto el log se quedaría en `queued`/`running`.
    await recordExecutionResult(job?.data?.logId, {
      status: 'failed',
      outcomes: [],
      error: `El worker no pudo procesar el job: ${err?.message || String(err)}`,
      durationMs: 0,
    });
  });

  worker.on('error', (err: any) => {
    if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND') return;
    console.error('[WorkflowWorker] Error:', err);
  });
};

/**
 * Ejecutor de acciones individuales.
 * Devuelve el id del artefacto creado (cuando aplica) para dejarlo en el
 * registro de idempotencia y en el log de la ejecución.
 */
async function executeAction(action: any, tenantId: string, payload: any): Promise<string | undefined> {
  switch (action.type) {
    case 'START_NURTURING':
      console.log(`[Action] Starting nurturing for ${payload.email} in campaign ${action.campaignId}`);
      return (await (prisma as any).campaignRecipient.create({
        data: {
          tenantId,
          campaignId: action.campaignId,
          email: payload.email,
          nombre: payload.nombre,
          status: 'pending'
        }
      }))?.id;

    case 'SEND_SOCIAL_POST':
      console.log(`[Action] Sending automated social post for tenant ${tenantId}`);
      await (SocialMediaService.schedulePost as any)({
        tenantId,
        content: action.content.replace('{{name}}', payload.nombre || ''),
        platforms: action.platforms
      });
      return undefined;

    case 'CREATE_CRM_TASK':
      console.log(`[Action] Creating CRM task for lead ${payload.leadId}`);
      return (await (prisma as any).task.create({
        data: {
          tenantId,
          leadId: payload.leadId,
          titulo: action.title,
          descripcion: action.description,
          tipo: 'FOLLOW_UP',
          prioridad: 'ALTA',
          fechaVencimiento: new Date(Date.now() + 24 * 60 * 60 * 1000)
        }
      }))?.id;

    case 'NOTIFY_GEMMA':
      console.log(`[Action] Notifying Gemma for optimization advice`);
      return undefined;

    // ─── Hospitality (plan maestro §22) ───────────────────────────
    case 'CREATE_HOSPITALITY_TASK':
      console.log(`[Action] Creating hospitality task for reservation ${payload.reservationId}`);
      return (await (prisma as any).task.create({
        data: {
          tenantId,
          contactId: payload.contactId || null,
          tipo: action.taskType || 'PREPARACION',
          titulo: action.title || `Preparar estancia ${payload.externalBookingId || ''}`.trim(),
          descripcion: action.description || 'Tarea creada por automatización de Hospitality',
          fechaVencimiento: action.dueInHours
            ? new Date(Date.now() + action.dueInHours * 60 * 60 * 1000)
            : new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      }))?.id;

    case 'CREATE_HOSPITALITY_CLEANING':
      console.log(`[Action] Creating cleaning task for unit ${payload.unitId}`);
      if (!payload.unitId) {
        throw new Error('unitId requerido para CREATE_HOSPITALITY_CLEANING');
      }
      return (await (prisma as any).hospitalityCleaningTask.create({
        data: {
          tenantId,
          unitId: payload.unitId,
          reservationId: payload.reservationId || null,
          prioridad: action.priority || 'normal',
          notas: action.notes || 'Limpieza creada por automatización de Hospitality',
        },
      }))?.id;

    case 'SEND_GUEST_MESSAGE':
      console.log(`[Action] Sending guest message for reservation ${payload.reservationId}`);
      if (!payload.reservationId) {
        throw new Error('reservationId requerido para SEND_GUEST_MESSAGE');
      }
      {
        const { dispararComunicacionReserva } = await import('../../hospitality/comunicaciones');
        await dispararComunicacionReserva({
          tenantId,
          reservationId: payload.reservationId,
          evento: action.evento || 'confirmacion',
        });
        return payload.reservationId;
      }

    case 'SET_UNIT_STATUS':
      console.log(`[Action] Setting unit ${payload.unitId} status to ${action.status}`);
      if (!payload.unitId) {
        throw new Error('unitId requerido para SET_UNIT_STATUS');
      }
      await (prisma as any).hospitalityUnit.update({
        where: { id: payload.unitId },
        data: { estado: action.status || 'available' },
      });
      return payload.unitId;

    default:
      // Antes se ignoraba en silencio y la ejecución se daba por buena. Un
      // tipo desconocido es un fallo real y debe quedar registrado.
      throw new Error(`Tipo de acción desconocido: ${action?.type || '(vacío)'}`);
  }
}
