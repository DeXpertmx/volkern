/**
 * Ejecución de una aprobación ya reclamada, con el recibo de idempotencia en un
 * solo sitio.
 *
 * Los dos caminos que ejecutan una aprobación —el código de un solo uso de
 * `whatsapp-auth` y la bandeja de `/api/mcp/approvals/[id]`— comparten aquí el
 * mismo orden: reclamar el recibo antes de llamar al proveedor, ejecutar una
 * sola vez, y registrar el desenlace (confirmado, rechazado o incierto). Así no
 * puede pasar que un camino libere la clave donde el otro la conserva.
 */
import { handleCallTool } from '@/lib/mcp/mcp-handler'
import {
  claveIdempotenciaEnvio,
  clasificarFalloDeEnvio,
  confirmarEnvioIdempotente,
  liberarEnvioIdempotente,
  marcarEnvioIncierto,
  reclamarEnvioIdempotente,
  resultadoDeReclamoAjeno,
} from '@/lib/mcp/whatsapp-idempotency'

/** Única herramienta del catálogo cuyo efecto externo exige recibo. */
const TOOL_ENVIO_WHATSAPP = 'volkern_send_whatsapp'

export interface AprobacionEjecutable {
  id: string
  tenantId: string
  toolName: string
  requestedById: string
  arguments?: Record<string, unknown> | null
  argumentsHash: string
  operationId?: string | null
}

export interface ResultadoEjecucion {
  ok: boolean
  result: unknown
}

export type EjecutorAprobado = () => Promise<ResultadoEjecucion>

/**
 * Ejecuta una herramienta del catálogo MCP con la identidad de quien la pidió
 * (aprobar no es actuar). Nunca lanza: el desenlace, incluido el tipado de un
 * envío, se devuelve para que el recibo se clasifique con él.
 */
export async function ejecutarToolDelCatalogo(
  aprobacion: AprobacionEjecutable
): Promise<ResultadoEjecucion> {
  try {
    const respuesta = await handleCallTool({
      name: aprobacion.toolName,
      arguments: {
        ...(aprobacion.arguments ?? {}),
        tenantId: aprobacion.tenantId,
        userId: aprobacion.requestedById,
        source: 'mcp',
      },
    })

    const texto = respuesta.content?.[0]?.text
    let result: unknown = null
    if (texto) {
      try {
        result = JSON.parse(texto)
      } catch {
        result = texto
      }
    }

    return { ok: !respuesta.isError, result }
  } catch (error) {
    // El desenlace tipado distingue un rechazo (seguro reintentar) de un
    // resultado incierto; el catch no debe borrarlo.
    const desenlace = (error as { desenlace?: unknown })?.desenlace
    return {
      ok: false,
      result: {
        error: error instanceof Error ? error.message : String(error),
        ...(typeof desenlace === 'string' ? { desenlace } : {}),
      },
    }
  }
}

/**
 * Ejecuta la aprobación gobernando el recibo del envío WhatsApp.
 *
 * Solo los envíos llevan recibo; el resto de herramientas se ejecuta tal cual.
 * Si otra petición con el mismo `operationId` ya lo mandó (o lo tiene en
 * vuelo), no se ejecuta: se devuelve lo que se sabe de aquel intento.
 */
export async function ejecutarAprobacion(params: {
  aprobacion: AprobacionEjecutable
  ejecutar: EjecutorAprobado
}): Promise<ResultadoEjecucion> {
  const { aprobacion, ejecutar } = params
  if (aprobacion.toolName !== TOOL_ENVIO_WHATSAPP) return ejecutar()

  const clave = claveIdempotenciaEnvio({
    tenantId: aprobacion.tenantId,
    toolName: aprobacion.toolName,
    operationId: aprobacion.operationId,
    approvalId: aprobacion.id,
  })
  const reclamo = await reclamarEnvioIdempotente({
    clave,
    tenantId: aprobacion.tenantId,
    toolName: aprobacion.toolName,
    approvalId: aprobacion.id,
    argumentsHash: aprobacion.argumentsHash,
    operationId: aprobacion.operationId,
  })
  if (!reclamo.reclamado) return resultadoDeReclamoAjeno(reclamo)

  const resultado = await ejecutar()

  if (resultado.ok) {
    // Si la confirmación falla, el recibo queda en `en_curso` y el barrido lo
    // pasa a `incierto`: nunca se libera un envío que pudo salir.
    await confirmarEnvioIdempotente({ clave, approvalId: aprobacion.id, result: resultado.result })
  } else if (clasificarFalloDeEnvio(resultado.result) === 'no_enviado') {
    // Rechazo confirmado: el mensaje no salió y el reintento es seguro.
    await liberarEnvioIdempotente({ clave, approvalId: aprobacion.id })
  } else {
    // Timeout, red o 5xx: pudo salir. La clave se conserva y bloquea el reintento.
    await marcarEnvioIncierto({ clave, approvalId: aprobacion.id, result: resultado.result })
  }

  return resultado
}
