import { prisma } from '../../db';

/**
 * Idempotencia de acciones de automatización.
 *
 * Un mismo evento puede llegar más de una vez:
 *   - la capa de conectividad reenvía el webhook,
 *   - una regla se vuelve a evaluar (varias reglas del mismo trigger, reintento),
 *   - un job de la cola se reprocesa.
 *
 * Sin registro, cada pasada volvería a crear la tarea, la limpieza o el
 * mensaje. Aquí se reclama una clave única por tenant ANTES de ejecutar:
 * quien llega primero ejecuta, los siguientes quedan como omitidos.
 *
 * La clave es `acción | ámbito | variante`:
 *   - ámbito: la reserva (o la tarea/unidad cuando la acción no viene de una
 *     reserva, p. ej. `cleaning_completed` → cambiar estado de unidad),
 *   - variante: lo que hace distinta a la acción (tipo de tarea + título, el
 *     evento del mensaje, el estado destino de la unidad...). Así un evento
 *     repetido se omite, pero dos acciones realmente distintas sobre la misma
 *     reserva (una tarea de preparación y otra de entrega de llaves, o un
 *     mensaje de confirmación y otro de reseña) siguen ejecutándose.
 */

/** Tipos de acción que no deben repetirse sobre el mismo ámbito. */
export const IDEMPOTENT_ACTION_TYPES = new Set([
  'CREATE_HOSPITALITY_TASK',
  'CREATE_HOSPITALITY_CLEANING',
  'SEND_GUEST_MESSAGE',
  'SET_UNIT_STATUS',
]);

export type ActionScopeType = 'reservation' | 'task' | 'unit' | 'lead' | 'contact' | 'deal';

export type ActionScope = { type: ActionScopeType; id: string };

/**
 * Resuelve el ámbito de la acción. La reserva manda; si el evento no trae
 * reserva se usa la tarea o la unidad (y como último recurso el lead/contacto
 * del CRM).
 */
export function resolveActionScope(payload: any): ActionScope | null {
  if (payload?.reservationId) return { type: 'reservation', id: String(payload.reservationId) };
  if (payload?.taskId) return { type: 'task', id: String(payload.taskId) };
  if (payload?.unitId) return { type: 'unit', id: String(payload.unitId) };
  if (payload?.leadId) return { type: 'lead', id: String(payload.leadId) };
  if (payload?.contactId) return { type: 'contact', id: String(payload.contactId) };
  if (payload?.dealId) return { type: 'deal', id: String(payload.dealId) };
  return null;
}

/** Lo que distingue a esta acción de otra del mismo tipo sobre el mismo ámbito. */
export function actionVariant(action: any): string {
  switch (action?.type) {
    case 'CREATE_HOSPITALITY_TASK':
      return `${action?.taskType || 'PREPARACION'}#${action?.title || ''}`;
    case 'SEND_GUEST_MESSAGE':
      return String(action?.evento || 'confirmacion');
    case 'SET_UNIT_STATUS':
      return String(action?.status || 'available');
    case 'CREATE_HOSPITALITY_CLEANING':
      return `limpieza#${action?.priority || 'normal'}`;
    default:
      return 'default';
  }
}

/** Clave de idempotencia de la acción, o null si la acción no aplica. */
export function buildActionKey(
  action: any,
  payload: any
): { key: string; actionType: string; scope: ActionScope } | null {
  if (!action?.type || !IDEMPOTENT_ACTION_TYPES.has(action.type)) return null;
  const scope = resolveActionScope(payload);
  if (!scope) return null;

  return {
    actionType: action.type,
    scope,
    key: `${action.type}|${scope.type}:${scope.id}|${actionVariant(action)}`,
  };
}

export type ActionClaim =
  | { status: 'claimed'; claimId: string }
  | { status: 'duplicate'; entityId: string | null }
  /** El registro no está disponible (p. ej. migración pendiente): se ejecuta sin deduplicar. */
  | { status: 'unavailable' };

export type ClaimActionParams = {
  tenantId: string;
  key: string;
  actionType: string;
  scope: ActionScope;
  /**
   * Job de la cola al que pertenece la ejecución. Si el mismo job vuelve
   * (BullMQ reintenta tras una caída del worker), recupera su reclamación en
   * lugar de quedar bloqueado: sin esto, morir entre reclamar y ejecutar
   * dejaría la tarea sin crear para siempre.
   */
  jobId?: string | null;
};

/**
 * Reclama la ejecución de la acción. Devuelve `duplicate` si ya se ejecutó
 * antes para el mismo ámbito y variante.
 *
 * Si el registro no está disponible la acción se ejecuta igual (fail-open):
 * es preferible una tarea duplicada a que todas las automatizaciones dejen
 * de funcionar por una tabla ausente. El fallo queda en consola.
 */
export async function claimActionExecution(params: ClaimActionParams): Promise<ActionClaim> {
  const { tenantId, key, actionType, scope, jobId } = params;

  try {
    const row = await (prisma as any).automationActionExecution.create({
      data: {
        tenantId,
        key,
        actionType,
        scopeType: scope.type,
        scopeId: scope.id,
        jobId: jobId ?? null,
        estado: 'claimed',
      },
    });
    return { status: 'claimed', claimId: row.id };
  } catch (error: any) {
    if (error?.code === 'P2002') {
      // Ya existe: otra pasada del mismo evento la ejecutó (o la está ejecutando).
      const existente = await (prisma as any).automationActionExecution
        .findUnique({
          where: { tenantId_key: { tenantId, key } },
          select: { id: true, entityId: true, estado: true, jobId: true },
        })
        .catch(() => null);

      // Reintento del MISMO job (el worker murió a mitad): se recupera la
      // reclamación para no dejar la acción sin ejecutar.
      if (jobId && existente?.jobId === jobId && existente?.estado === 'claimed') {
        await (prisma as any).automationActionExecution
          .update({ where: { id: existente.id }, data: { createdAt: new Date() } })
          .catch(() => {});
        return { status: 'claimed', claimId: existente.id };
      }

      return { status: 'duplicate', entityId: existente?.entityId ?? null };
    }

    console.error(
      `[ActionIdempotency] Registro no disponible, la acción se ejecuta sin deduplicar (${actionType}):`,
      error
    );
    return { status: 'unavailable' };
  }
}

/** Marca la ejecución como completada y guarda el artefacto creado. */
export async function completeActionExecution(claimId: string, entityId?: string | null) {
  try {
    await (prisma as any).automationActionExecution.update({
      where: { id: claimId },
      data: { estado: 'done', entityId: entityId ?? null },
    });
  } catch (error) {
    console.error(`[ActionIdempotency] No se pudo cerrar la reclamación ${claimId}:`, error);
  }
}

/**
 * Libera la reclamación cuando la acción falló, para que un intento
 * posterior pueda ejecutarla de nuevo (si no, un fallo bloquearía el trabajo
 * para siempre).
 */
export async function releaseActionExecution(claimId: string) {
  try {
    await (prisma as any).automationActionExecution.delete({ where: { id: claimId } });
  } catch (error) {
    console.error(`[ActionIdempotency] No se pudo liberar la reclamación ${claimId}:`, error);
  }
}
