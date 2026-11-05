/**
 * Identidad de las peticiones MCP.
 *
 * Las dos superficies MCP (`/mcp` y `/api/mcp`) reciben argumentos de
 * herramienta que llegan del cliente y, por tanto, de un modelo de lenguaje
 * que puede haber sido manipulado con texto que él no escribió — una nota de
 * un lead, el nombre de un contacto, el asunto de un correo—. El tenant y el
 * usuario NUNCA pueden salir de ahí: se derivan de la credencial ya validada
 * por `authenticateRequest`.
 *
 * Regla: si el cuerpo trae un `tenantId`/`userId` que no coincide con el de la
 * credencial se RECHAZA con 403 en lugar de ignorarlo. Ignorarlo en silencio
 * deja el intento de cruce fuera de la auditoría; el rechazo lo convierte en
 * señal y permite ver quién lo intentó.
 *
 * La delegación legítima —un administrador que actúa sobre otra empresa de su
 * jerarquía— ya la resuelve `resolveHierarchicalContext` dentro de
 * `authenticateRequest` a partir de `X-Impersonate-Tenant-Id` /
 * `target_account_id`, y llega aquí como identidad efectiva. Este módulo no
 * abre una segunda vía de delegación: si algún día hace falta "actuar en
 * nombre de", debe ser un campo con su propio permiso, no un `userId` genérico.
 */

export type McpIdentityField = 'tenantId' | 'userId'

export interface McpCredentialLike {
  tenant?: { id?: string | null } | null
  user?: { id?: string | null } | null
}

export interface McpSuppliedIdentity {
  tenantId?: unknown
  userId?: unknown
}

export type McpIdentityResult =
  | { ok: true; tenantId?: string; userId?: string }
  | { ok: false; field: McpIdentityField; requested: string; message: string }

/** Solo una cadena no vacía cuenta como valor enviado por el cliente. */
function supplied(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value : undefined
}

/**
 * Resuelve la identidad efectiva de una llamada MCP.
 *
 * - Sin valores en el cuerpo: devuelve la identidad de la credencial.
 * - Valores iguales a la credencial: se aceptan (un cliente puede repetirlos).
 * - Valores distintos: `ok: false` con el campo culpable, para responder 403.
 * - Valores cuando la credencial no los aporta: también se rechazan; si no se
 *   pueden verificar, no se confían.
 */
export function resolveMcpIdentity(
  auth: McpCredentialLike,
  suppliedIdentity: McpSuppliedIdentity
): McpIdentityResult {
  const tenantId = auth.tenant?.id ?? undefined
  const userId = auth.user?.id ?? undefined

  const requestedTenant = supplied(suppliedIdentity.tenantId)
  if (requestedTenant && requestedTenant !== tenantId) {
    return {
      ok: false,
      field: 'tenantId',
      requested: requestedTenant,
      message:
        'tenantId no coincide con la credencial autenticada. La empresa se deriva del token, no se acepta del cuerpo de la petición.',
    }
  }

  const requestedUser = supplied(suppliedIdentity.userId)
  if (requestedUser && requestedUser !== userId) {
    return {
      ok: false,
      field: 'userId',
      requested: requestedUser,
      message:
        'userId no coincide con la credencial autenticada. El usuario se deriva del token, no se acepta del cuerpo de la petición.',
    }
  }

  return { ok: true, tenantId, userId }
}

/**
 * Audita (best-effort) un intento de llamada con identidad no verificable.
 *
 * No lanza: la respuesta 403 debe salir aunque el log de auditoría falle.
 * Escribe en `AuditLog` —la misma tabla que el resto de ejecuciones MCP— para
 * que el intento de cruce aparezca junto a las llamadas legítimas y no en un
 * log aparte que nadie consulta.
 */
export async function auditMcpIdentityRejection(params: {
  auth: McpCredentialLike
  identity: Extract<McpIdentityResult, { ok: false }>
  toolName?: unknown
  superficie: '/mcp' | '/api/mcp'
}): Promise<void> {
  const { auth, identity, toolName, superficie } = params
  const tool = typeof toolName === 'string' ? toolName : undefined

  try {
    const { prisma } = await import('@/lib/db')
    await prisma.auditLog.create({
      data: {
        // FK a Tenant: 'unknown' violaría la restricción y el rechazo —que es
        // justo la señal que queremos registrar— se perdería. null es válido.
        tenantId: auth.tenant?.id ?? null,
        userId: auth.user?.id,
        accion: 'MCP_identity_rejected',
        entidad: 'MCP',
        entidadId: tool || 'unknown',
        descripcion: `MCP ${superficie}: identidad rechazada (${identity.field})`,
        metadata: {
          superficie,
          tool,
          field: identity.field,
          requested: identity.requested,
          credentialTenantId: auth.tenant?.id ?? null,
          credentialUserId: auth.user?.id ?? null,
          status: 'rejected',
        },
      },
    })
  } catch (error) {
    console.error('[MCP] No se pudo auditar el rechazo de identidad:', error)
  }
}
