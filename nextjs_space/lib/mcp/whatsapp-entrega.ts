/**
 * Desenlace real de un envío WhatsApp: el ACK que manda Evolution.
 *
 * Un envío puede aceptarse en el proveedor y no confirmar al responder (timeout,
 * red), o quedarse en «enviado» sin que nadie sepa si llegó. El webhook de
 * Evolution trae después los ACK del mensaje; aquí se traducen a un estado y se
 * guardan en la solicitud de aprobación que lo originó, que es el recibo.
 *
 * Reglas:
 *   - Solo avanza: `enviado → entregado → leído`. Un ACK viejo no retrocede.
 *   - `fallido` no pisa un envío ya confirmado.
 *   - Si la solicitud se cerró como `failed` porque no hubo confirmación y el
 *     proveedor confirma que salió, pasa a `executed`: el mensaje sí salió.
 */
import { prisma } from '@/lib/db'

export type EstadoEntregaWhatsapp = 'enviado' | 'entregado' | 'leido' | 'fallido'

const ESTADOS: Record<string, EstadoEntregaWhatsapp> = {
  SERVER_ACK: 'enviado',
  '1': 'enviado',
  DELIVERY_ACK: 'entregado',
  '2': 'entregado',
  READ: 'leido',
  PLAYED: 'leido',
  '3': 'leido',
  '4': 'leido',
  ERROR: 'fallido',
  ERROR_ACK: 'fallido',
  FAILED: 'fallido',
}

const RANGO: Record<EstadoEntregaWhatsapp, number> = {
  fallido: 0,
  enviado: 1,
  entregado: 2,
  leido: 3,
}

/** Traduce el estado crudo de Evolution; `null` si no dice nada del mensaje. */
export function estadoDeEntrega(status: string): EstadoEntregaWhatsapp | null {
  return ESTADOS[String(status).trim().toUpperCase()] ?? null
}

/** `true` si el ACK nuevo aporta información que el guardado no tenía. */
function avanza(actual: string | null, nuevo: EstadoEntregaWhatsapp): boolean {
  if (!actual) return true
  if (actual === 'fallido') return nuevo !== 'fallido'
  // Un envío confirmado no se degrada por un ACK de error tardío.
  if (nuevo === 'fallido') return false
  return RANGO[nuevo] > RANGO[actual as EstadoEntregaWhatsapp]
}

/**
 * Busca el id de mensaje del proveedor dentro del resultado del skill
 * (`{ resultado: { messageId } }`, `{ data: { key: { id } } }`, etc.).
 */
export function idDeMensajeEnResultado(result: unknown): string | null {
  const buscar = (valor: unknown, profundidad = 0): string | null => {
    if (!valor || typeof valor !== 'object' || profundidad > 3) return null
    const obj = valor as Record<string, any>
    const directo = obj.messageId ?? obj.key?.id ?? obj.data?.key?.id
    if (typeof directo === 'string' && directo) return directo
    for (const clave of ['resultado', 'result', 'data']) {
      const anidado = buscar(obj[clave], profundidad + 1)
      if (anidado) return anidado
    }
    return null
  }
  return buscar(result)
}

/** Anota el desenlace de entrega en el resultado guardado, sin perder el resto. */
function conEntrega(
  result: unknown,
  estado: EstadoEntregaWhatsapp,
  cuando: Date
): Record<string, unknown> {
  const entrega = { estado, actualizadoEn: cuando.toISOString() }
  return result && typeof result === 'object' && !Array.isArray(result)
    ? { ...(result as Record<string, unknown>), entrega }
    : { entrega }
}

/**
 * Cierra a mano el desenlace de un envío que el proveedor no supo confirmar.
 * No aplica la regla de avance: es una decisión administrativa explícita, aunque
 * solo se permite elegir entre entregado y no entregado.
 */
export async function resolverEntregaManual(params: {
  approvalId: string
  tenantId: string
  estado: 'entregado' | 'fallido'
}): Promise<boolean> {
  const solicitud = await prisma.mcpApprovalRequest.findFirst({
    where: { id: params.approvalId, tenantId: params.tenantId },
    select: { id: true, status: true, result: true },
  })
  if (!solicitud) return false

  const cuando = new Date()
  await prisma.mcpApprovalRequest.update({
    where: { id: solicitud.id },
    data: {
      entregaEstado: params.estado,
      entregaActualizadaEn: cuando,
      result: conEntrega(solicitud.result, params.estado, cuando) as never,
      ...(params.estado === 'entregado' && solicitud.status === 'failed'
        ? { status: 'executed', executedAt: cuando }
        : {}),
    },
  })
  return true
}

/**
 * Guarda en la solicitud el ACK del mensaje. Devuelve si cambió algo, para que
 * el webhook no repita trabajo con eventos duplicados.
 */
export async function registrarEntregaDeWhatsapp(params: {
  messageId: string
  estado: EstadoEntregaWhatsapp
  cuando?: Date
}): Promise<{ actualizada: boolean; approvalId?: string }> {
  const { messageId, estado } = params
  if (!messageId) return { actualizada: false }

  const solicitud = await prisma.mcpApprovalRequest.findFirst({
    where: { whatsappMessageId: messageId },
    select: { id: true, status: true, entregaEstado: true, result: true },
  })
  if (!solicitud) return { actualizada: false }
  if (!avanza(solicitud.entregaEstado, estado)) {
    return { actualizada: false, approvalId: solicitud.id }
  }

  const cuando = params.cuando ?? new Date()
  const confirmado = estado !== 'fallido'

  await prisma.mcpApprovalRequest.update({
    where: { id: solicitud.id },
    data: {
      entregaEstado: estado,
      entregaActualizadaEn: cuando,
      result: conEntrega(solicitud.result, estado, cuando) as never,
      // Se cerró como fallida por falta de confirmación y el ACK demuestra que
      // el mensaje salió: la solicitud pasa a ejecutada.
      ...(confirmado && solicitud.status === 'failed'
        ? { status: 'executed', executedAt: cuando }
        : {}),
    },
  })

  return { actualizada: true, approvalId: solicitud.id }
}
