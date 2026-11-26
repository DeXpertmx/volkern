/**
 * Cierre de aprobaciones MCP reclamadas cuyo desenlace nunca se registró.
 *
 * Tanto `verifyAndExecuteWhatsappAuthCode` como la ejecución aprobada de la
 * bandeja pasan la solicitud a `approved` y ejecutan FUERA de la transacción
 * (para no retener el bloqueo durante la llamada externa). Si el proceso muere
 * entre ambos pasos —deploy, OOM, reinicio, timeout duro—, la fila se queda en
 * `approved` sin `executedAt`: ya no se puede ejecutar y su estado miente.
 *
 * Este barrido la pasa a `failed`, que es terminal y honesto (hubo reclamación
 * pero no resultado), y deja el motivo en `result`. Solo toca filas `approved`
 * sin desenlace y reclamadas hace más de `olderThanMinutes`, para no competir
 * con un envío que siga en curso.
 */
import { prisma } from '@/lib/db';
import { MINUTOS_ENVIO_SIN_CONFIRMAR } from './whatsapp-idempotency';

/**
 * Margen antes de dar una reclamación por huérfana. Es el mismo que usa el
 * recibo del envío: los dos barridos cierran la misma ventana.
 */
export const MINUTOS_RECLAMACION_HUERFANA = MINUTOS_ENVIO_SIN_CONFIRMAR;

const MOTIVO_HUERFANA =
  'Desenlace no registrado: el proceso se interrumpió después de reclamar la solicitud.';

export async function reconciliarAprobacionesHuerfanas(params?: {
  olderThanMinutes?: number;
  ahora?: Date;
}): Promise<{ cerradas: number }> {
  const minutos = params?.olderThanMinutes ?? MINUTOS_RECLAMACION_HUERFANA;
  const ahora = params?.ahora ?? new Date();
  const corte = new Date(ahora.getTime() - minutos * 60_000);

  const resultado = await prisma.mcpApprovalRequest.updateMany({
    where: {
      status: 'approved',
      executedAt: null,
      resolvedAt: { lt: corte },
    },
    data: {
      status: 'failed',
      executedAt: ahora,
      result: { error: MOTIVO_HUERFANA },
    },
  });

  return { cerradas: resultado.count };
}
