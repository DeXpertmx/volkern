/**
 * Clave de idempotencia de los envíos WhatsApp aprobados por MCP.
 *
 * El envío vive fuera de la transacción de la solicitud. Si el proceso muere o
 * el barrido de reclamaciones huérfanas cierra la fila por falta de desenlace
 * mientras la llamada al proveedor sigue en vuelo, una nueva petición con los
 * mismos argumentos podría mandar el mensaje por segunda vez.
 *
 * Para evitarlo se crea un recibo ANTES de llamar al proveedor. La clave es
 * `(empresa, herramienta, hash canónico de argumentos)`: dos peticiones
 * distintas que piden exactamente el mismo envío comparten recibo, y la que
 * llega después no envía. Solo un envío fallido lo libera.
 *
 * La ventana de 24 h se mide sobre `updatedAt`, que Prisma refresca en cada
 * escritura: un recibo caducado se puede tomar con un único UPDATE condicionado
 * y, al tomarlo, la ventana vuelve a empezar sin tocar fechas a mano.
 */
import { createHash } from 'node:crypto';
import { prisma } from '@/lib/db';

export const VENTANA_IDEMPOTENCIA_MINUTOS = 24 * 60;

export type EstadoRecibo = 'en_curso' | 'enviado';

const EN_CURSO: EstadoRecibo = 'en_curso';
const ENVIADO: EstadoRecibo = 'enviado';

export function claveIdempotenciaEnvio(params: {
  tenantId: string;
  toolName: string;
  argumentsHash: string;
}): string {
  return createHash('sha256')
    .update(`${params.tenantId}|${params.toolName}|${params.argumentsHash}`)
    .digest('hex');
}

export type ReclamoEnvio =
  | { reclamado: true }
  | {
      reclamado: false;
      /** `en_curso`: el envío anterior aún no confirmó; `enviado`: ya salió. */
      estado: EstadoRecibo;
      resultado: unknown;
    };

/**
 * Intenta quedarse con el envío. Devuelve `reclamado: false` cuando ya existe un
 * recibo vigente: quien llama NO debe enviar.
 */
export async function reclamarEnvioIdempotente(params: {
  clave: string;
  tenantId: string;
  toolName: string;
  approvalId: string;
}): Promise<ReclamoEnvio> {
  const { clave, tenantId, toolName, approvalId } = params;

  // 1. Camino normal: no hay recibo para esta clave.
  try {
    await prisma.whatsappSendReceipt.create({
      data: { key: clave, tenantId, toolName, approvalId },
    });
    return { reclamado: true };
  } catch (error: any) {
    if (error?.code !== 'P2002') throw error;
  }

  // 2. Hay recibo. Si está fuera de la ventana, se toma con un UPDATE
  //    condicionado: en Postgres solo una petición puede ganarlo.
  const corte = new Date(Date.now() - VENTANA_IDEMPOTENCIA_MINUTOS * 60_000);
  const toma = await prisma.whatsappSendReceipt.updateMany({
    where: { key: clave, updatedAt: { lt: corte } },
    data: { approvalId, status: EN_CURSO, result: null as never },
  });
  if (toma.count > 0) return { reclamado: true };

  // 3. Recibo vigente: se devuelve su estado sin enviar. Si desapareció entre
  //    el conflicto y la lectura, se falla cerrado.
  const vigente = await prisma.whatsappSendReceipt.findUnique({
    where: { key: clave },
    select: { status: true, result: true },
  });

  return {
    reclamado: false,
    estado: vigente?.status === ENVIADO ? ENVIADO : EN_CURSO,
    resultado: vigente?.result ?? null,
  };
}

/**
 * Qué responder cuando el recibo ya estaba tomado: no se envía y se devuelve lo
 * que se sabe del envío anterior. Compartido por los dos caminos de ejecución.
 */
export function resultadoDeReclamoAjeno(
  reclamo: Extract<ReclamoEnvio, { reclamado: false }>
): { ok: boolean; result: unknown } {
  const ok = reclamo.estado === ENVIADO;
  return {
    ok,
    result:
      reclamo.resultado ??
      (ok
        ? { aviso: 'El envío ya estaba registrado; no se reenvió.' }
        : { error: 'Ya hay un envío en curso para esta misma solicitud; no se reenvió.' }),
  };
}

/** Marca el envío como realizado y guarda su resultado. */
export async function confirmarEnvioIdempotente(params: {
  clave: string;
  approvalId: string;
  result: unknown;
}): Promise<void> {
  await prisma.whatsappSendReceipt
    .updateMany({
      where: { key: params.clave, approvalId: params.approvalId },
      data: { status: ENVIADO, result: params.result as never },
    })
    .catch((error) =>
      console.error('[MCP idempotencia] No se pudo confirmar el envío:', error)
    );
}

/**
 * Libera el recibo tras un envío fallido. Solo borra el recibo del propio
 * intento y en estado `en_curso`: nunca el de un envío ya confirmado.
 */
export async function liberarEnvioIdempotente(params: {
  clave: string;
  approvalId: string;
}): Promise<void> {
  await prisma.whatsappSendReceipt
    .deleteMany({
      where: {
        key: params.clave,
        approvalId: params.approvalId,
        status: EN_CURSO,
      },
    })
    .catch((error) =>
      console.error('[MCP idempotencia] No se pudo liberar el envío:', error)
    );
}
