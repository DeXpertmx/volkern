/**
 * Auditoría del gate REST.
 *
 * El gate decide en `lib/mcp/tool-policy.ts` (función pura). Este módulo es lo
 * único que toca la base de datos: deja constancia de que una credencial de API
 * intentó una operación irreversible y recibió un 403.
 *
 * Va en `AuditLog` con la misma forma que `MCP_tool_denied`, no en un log
 * aparte, para que el intento aparezca junto a las ejecuciones legítimas de la
 * misma empresa. Un 403 sin rastro es indistinguible de un cliente con la
 * integración mal configurada; con rastro, se puede contar quién lo intentó y
 * cuántas veces antes de decidir si hace falta una allowlist por empresa.
 *
 * Best-effort: nunca lanza. La respuesta 403 debe salir aunque el registro
 * falle; perder la traza es malo, bloquear la denegación sería peor.
 */

import type { RestDecision } from '@/lib/mcp/tool-policy'

export interface RestDenialAudit {
  auth: {
    tenant?: { id?: string | null } | null
    user?: { id?: string | null } | null
    apiKey?: { id?: string | null; nombre?: string | null } | null
  }
  method: string
  path: string
  decision: Extract<RestDecision, { decision: 'deny' }>
}

export async function auditRestDenial(params: RestDenialAudit): Promise<void> {
  const { auth, method, path, decision } = params

  try {
    const { prisma } = await import('@/lib/db')
    await prisma.auditLog.create({
      data: {
        // `tenantId` es FK a Tenant: sólo se puede escribir el de la credencial
        // ya validada. Si faltara, `null` es válido y el rechazo no se pierde.
        tenantId: auth.tenant?.id ?? null,
        userId: auth.user?.id ?? null,
        accion: 'REST_action_denied',
        entidad: 'REST',
        entidadId: decision.capability,
        descripcion: `API key rechazada en ${method} ${path} (${decision.capability}, ${decision.risk})`,
        metadata: {
          method,
          path,
          capability: decision.capability,
          risk: decision.risk,
          mcpTool: decision.mcpTool,
          apiKeyId: auth.apiKey?.id ?? null,
          apiKeyName: auth.apiKey?.nombre ?? null,
          authMethod: 'apikey',
          status: 'denied',
        },
      },
    })
  } catch (error) {
    console.error('[REST gate] No se pudo auditar la denegación:', error)
  }
}
