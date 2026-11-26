/**
 * Recibo de idempotencia de los envíos WhatsApp aprobados por MCP.
 *
 * El envío vive fuera de la transacción de la solicitud. Si el proceso muere o
 * el barrido cierra la fila mientras la llamada al proveedor sigue en vuelo, un
 * reintento podría mandar el mensaje otra vez. Para evitarlo se crea un recibo
 * ANTES de llamar al proveedor.
 *
 * El recibo identifica la solicitud: reintentarla no reenvía. Además se bloquea
 * cualquier recibo del MISMO CONTENIDO que siga `en_curso` o quede `incierto`,
 * que es lo que impide que el barrido reabra el duplicado.
 *
 * Estados del recibo:
 *   - `en_curso`: reclamado, sin desenlace. Un `en_curso` caducado es un
 *     cerrojo huérfano y puede re-tomarse.
 *   - `enviado`: el proveedor aceptó el mensaje. Nunca se re-toma.
 *   - `incierto`: el proveedor no confirmó (timeout, red, 5xx). Pudo salir, así
 *     que tampoco se re-toma; liberar aquí es la vía del duplicado.
 * Solo un rechazo confirmado —validación local o 4xx del proveedor— libera la
 * clave, porque entonces consta que el mensaje no salió.
 *
 * La ventana de 24 h se mide sobre `updatedAt`, que Prisma refresca en cada
 * escritura: se re-toma con un único UPDATE condicionado y, al tomarlo, la
 * ventana vuelve a empezar sin tocar fechas a mano.
 */
import { createHash } from 'node:crypto';
import { prisma } from '@/lib/db';

export const VENTANA_IDEMPOTENCIA_MINUTOS = 24 * 60;

/** Margen tras el cual un envío sin respuesta se da por incierto. */
export const MINUTOS_ENVIO_SIN_CONFIRMAR = 10;

export type EstadoRecibo = 'en_curso' | 'enviado' | 'incierto';

const EN_CURSO: EstadoRecibo = 'en_curso';
const ENVIADO: EstadoRecibo = 'enviado';
const INCIERTO: EstadoRecibo = 'incierto';

/** Qué se puede afirmar de un envío que falló. */
export type DesenlaceDeEnvio = 'no_enviado' | 'incierto';

/**
 * Clasifica el fallo de un envío. Solo usa el desenlace tipado que adjunta
 * `lib/whatsapp.ts` (validación previa, 4xx del proveedor, timeout, 5xx). Si no
 * viene —un error inesperado— se asume incierto: pudo salir y no se libera.
 */
export function clasificarFalloDeEnvio(result: unknown): DesenlaceDeEnvio {
  const desenlace = (result as { desenlace?: unknown } | null)?.desenlace;
  return desenlace === 'no_enviado' ? 'no_enviado' : 'incierto';
}

/**
 * Clave del recibo: la solicitud. El bloqueo por contenido, más abajo, cubre el
 * caso de que otra solicitud pida el mismo mensaje mientras ésta no se cierra.
 */
export function claveIdempotenciaEnvio(params: {
  tenantId: string;
  toolName: string;
  approvalId: string;
}): string {
  return createHash('sha256')
    .update(`${params.tenantId}|${params.toolName}|${params.approvalId}`)
    .digest('hex');
}

export type ReclamoEnvio =
  | { reclamado: true }
  | {
      reclamado: false;
      /** `en_curso`: sigue en vuelo; `enviado`: ya salió; `incierto`: no se sabe. */
      estado: EstadoRecibo;
      resultado: unknown;
    };

/** Traduce la fila del recibo al estado tipado del reclamo. */
function reclamoDesde(recibo: { status: string; result: unknown }): ReclamoEnvio {
  const estado: EstadoRecibo =
    recibo.status === ENVIADO ? ENVIADO : recibo.status === INCIERTO ? INCIERTO : EN_CURSO;
  return { reclamado: false, estado, resultado: recibo.result ?? null };
}

/**
 * Intenta quedarse con el envío. Devuelve `reclamado: false` cuando ya existe un
 * recibo que impide enviar: quien llama NO debe hacerlo.
 *
 * Además de la clave de la solicitud, bloquea un intento anterior del MISMO
 * CONTENIDO que siga `en_curso` o quede `incierto`: otra solicitud que pida el
 * mismo mensaje no lo repite mientras no se sepa su desenlace.
 */
export async function reclamarEnvioIdempotente(params: {
  clave: string;
  tenantId: string;
  toolName: string;
  approvalId: string;
  argumentsHash: string;
}): Promise<ReclamoEnvio> {
  const { clave, tenantId, toolName, approvalId, argumentsHash } = params;

  const reciboDelMismoContenido = () =>
    prisma.whatsappSendReceipt.findFirst({
      where: { tenantId, toolName, argumentsHash, status: { in: [EN_CURSO, INCIERTO] } },
      select: { status: true, result: true },
    });

  const previo = await reciboDelMismoContenido();
  if (previo) return reclamoDesde(previo);

  // 1. Camino normal: no hay recibo para esta clave.
  try {
    await prisma.whatsappSendReceipt.create({
      data: { key: clave, tenantId, toolName, approvalId, argumentsHash },
    });
    return { reclamado: true };
  } catch (error: any) {
    if (error?.code !== 'P2002') throw error;
  }

  // 2. Hay recibo. Si es un `en_curso` fuera de la ventana, se toma con un
  //    UPDATE condicionado: en Postgres solo una petición puede ganarlo.
  const corte = new Date(Date.now() - VENTANA_IDEMPOTENCIA_MINUTOS * 60_000);
  const toma = await prisma.whatsappSendReceipt.updateMany({
    // Solo un `en_curso` caducado (cerrojo huérfano de un proceso muerto) se
    // re-toma. Un `enviado` o un `incierto` nunca: reenviarlos duplicaría el
    // mensaje, que es justo lo que el recibo evita.
    where: { key: clave, status: EN_CURSO, updatedAt: { lt: corte } },
    data: { approvalId, argumentsHash, result: null as never },
  });
  if (toma.count > 0) return { reclamado: true };

  // 3. Recibo vigente: se devuelve su estado sin enviar.
  const vigente = await prisma.whatsappSendReceipt.findUnique({
    where: { key: clave },
    select: { status: true, result: true },
  });
  if (vigente) return reclamoDesde(vigente);

  // 4. La clave desapareció entre el conflicto y la lectura, pero puede haber
  //    un intento del mismo contenido: se comprueba antes de fallar cerrado.
  const previoTrasConflicto = await reciboDelMismoContenido();
  if (previoTrasConflicto) return reclamoDesde(previoTrasConflicto);

  return { reclamado: false, estado: EN_CURSO, resultado: null };
}

/**
 * Qué responder cuando el recibo ya estaba tomado: no se envía y se devuelve lo
 * que se sabe del envío anterior. Compartido por los dos caminos de ejecución.
 */
export function resultadoDeReclamoAjeno(
  reclamo: Extract<ReclamoEnvio, { reclamado: false }>
): { ok: boolean; result: unknown } {
  // De un envío confirmado interesa su resultado real; de uno incierto o en
  // vuelo, el motivo (el error crudo del intento anterior confundiría).
  if (reclamo.estado === ENVIADO) {
    return {
      ok: true,
      result:
        reclamo.resultado && typeof reclamo.resultado === 'object'
          ? reclamo.resultado
          : { aviso: 'El envío ya estaba registrado; no se reenvió.' },
    };
  }

  return {
    ok: false,
    result:
      reclamo.estado === INCIERTO
        ? { error: 'El envío anterior de este mismo mensaje no confirmó su entrega; no se reenvió.' }
        : { error: 'Ya hay un envío en curso para este mismo mensaje; no se reenvió.' },
  };
}

/** Marca el envío como realizado y guarda su resultado. */
export async function confirmarEnvioIdempotente(params: {
  clave: string;
  approvalId: string;
  result: unknown;
}): Promise<boolean> {
  try {
    const confirmado = await prisma.whatsappSendReceipt.updateMany({
      where: { key: params.clave, approvalId: params.approvalId },
      data: { status: ENVIADO, result: params.result as never },
    });
    if (confirmado.count === 0) {
      console.warn(
        '[MCP idempotencia] El recibo cambió antes de confirmar el envío:',
        params.clave
      );
      return false;
    }
    return true;
  } catch (error) {
    console.error('[MCP idempotencia] No se pudo confirmar el envío:', error);
    return false;
  }
}

/**
 * Marca el recibo como incierto: el proveedor no confirmó y el mensaje pudo
 * salir. Bloquea el reintento igual que `en_curso`, pero deja de mentir sobre
 * un envío que sigue "en curso".
 */
export async function marcarEnvioIncierto(params: {
  clave: string;
  approvalId: string;
  result: unknown;
}): Promise<void> {
  await prisma.whatsappSendReceipt
    .updateMany({
      where: { key: params.clave, approvalId: params.approvalId },
      data: { status: INCIERTO, result: params.result as never },
    })
    .catch((error) =>
      console.error('[MCP idempotencia] No se pudo marcar el envío como incierto:', error)
    );
}

/**
 * Libera el recibo tras un fallo CONFIRMADO del propio intento. Se borra
 * también si el barrido ya lo marcó `incierto` mientras la llamada seguía en
 * vuelo: el rechazo demuestra que el mensaje no salió.
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
        status: { in: [EN_CURSO, INCIERTO] },
      },
    })
    .catch((error) =>
      console.error('[MCP idempotencia] No se pudo liberar el envío:', error)
    );
}

/**
 * Cierra como inciertos los recibos que llevan demasiado tiempo sin desenlace
 * (proceso muerto, respuesta que nunca llegó). No los libera: el mensaje pudo
 * salir y liberarlos abriría la puerta al duplicado.
 */
export async function reconciliarRecibosSinConfirmar(params?: {
  olderThanMinutes?: number;
  ahora?: Date;
}): Promise<{ marcados: number }> {
  const minutos = params?.olderThanMinutes ?? MINUTOS_ENVIO_SIN_CONFIRMAR;
  const ahora = params?.ahora ?? new Date();
  const corte = new Date(ahora.getTime() - minutos * 60_000);

  const resultado = await prisma.whatsappSendReceipt.updateMany({
    where: { status: EN_CURSO, updatedAt: { lt: corte } },
    data: {
      status: INCIERTO,
      result: {
        error: 'Envío sin confirmación: el proceso no registró el desenlace.',
      } as never,
    },
  });

  return { marcados: resultado.count };
}
