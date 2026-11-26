/**
 * Ejecución de una aprobación ya reclamada.
 *
 * La solicitud es su propio recibo: quien la reclama la ejecuta una sola vez y
 * la unicidad de `(empresa, operationId)` impide que otra petición del mismo
 * envío llegue hasta aquí. Este módulo solo resuelve cómo se ejecuta.
 */
import { handleCallTool } from '@/lib/mcp/mcp-handler'

export interface AprobacionEjecutable {
  id: string
  tenantId: string
  toolName: string
  requestedById: string
  arguments?: Record<string, unknown> | null
}

export interface ResultadoEjecucion {
  ok: boolean
  result: unknown
}

/**
 * Ejecuta una herramienta del catálogo MCP con la identidad de quien la pidió
 * (aprobar no es actuar). Nunca lanza: el desenlace, incluido el tipado de un
 * envío, se devuelve para registrarlo en la solicitud.
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
    // El desenlace tipado distingue un rechazo del proveedor de un resultado
    // incierto; el catch no debe borrarlo.
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
