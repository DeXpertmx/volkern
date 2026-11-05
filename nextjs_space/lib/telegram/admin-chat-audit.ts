import { prisma } from '@/lib/db'

/**
 * Auditoría del chat de administración de Telegram.
 *
 * Vincular un chat hace que una cuenta de Telegram empiece a recibir los avisos
 * de la empresa; desvincularlo los silencia. Las dos cosas las decide una
 * persona (un administrador en el panel, o quien pulsa el enlace de un solo uso
 * dentro de Telegram), así que las dos tienen que quedar en el `AuditLog` con
 * su tenant, su actor y su fecha. Sin eso no hay forma de responder «¿quién
 * dejó de mandarle avisos a esta empresa, y cuándo?».
 *
 * Se escribe aquí y no dentro de `admin-link.ts` porque el actor solo se conoce
 * en quien ejecuta la acción: la ruta `DELETE` tiene la sesión del panel y el
 * webhook tiene el `from` de Telegram. El módulo de enlaces se queda como pura
 * persistencia del token.
 *
 * Nunca lanza: una auditoría fallida no puede tumbar un vínculo que ya está
 * guardado ni una baja que ya está hecha (mismo criterio que
 * `logAuditAction`).
 */

/** Entidad del `AuditLog` para todas las filas de este flujo. */
export const ENTIDAD_CHAT_ADMIN = 'telegram_admin_chat'

export const ACCION_CHAT_ADMIN_VINCULADO = 'telegram_admin_chat_vinculado'
export const ACCION_CHAT_ADMIN_DESVINCULADO = 'telegram_admin_chat_desvinculado'

/** Quién pulsó el enlace dentro de Telegram. No es un `User` del panel. */
export interface ActorTelegram {
  id?: string | number | null
  username?: string | null
  /** Nombre visible (`first_name` + `last_name`). */
  nombre?: string | null
}

export interface AuditarChatAdminParams {
  accion: 'vinculado' | 'desvinculado'
  tenantId: string
  /**
   * Usuario del panel que pidió el enlace (al vincular) o que dio la baja. Va
   * en la columna `userId`, que es la que relaciona la fila con una persona de
   * la cuenta. `null` cuando el vínculo no consta a nombre de nadie.
   */
  userId?: string | null
  chatId?: string | null
  actorTelegram?: ActorTelegram | null
  /** ISO de cuándo se había vinculado el chat que ahora se da de baja. */
  vinculadoDesde?: string | null
}

function describirActorTelegram(actor?: ActorTelegram | null): string | null {
  if (!actor) return null
  const partes: string[] = []
  const username = typeof actor.username === 'string' ? actor.username.replace(/^@/, '').trim() : ''
  if (username) partes.push(`@${username}`)
  if (actor.nombre?.trim()) partes.push(actor.nombre.trim())
  if (actor.id !== null && actor.id !== undefined && String(actor.id).trim()) {
    partes.push(`id ${String(actor.id).trim()}`)
  }
  return partes.length ? partes.join(' · ') : null
}

function describir(params: AuditarChatAdminParams, actor: string | null): string {
  const chat = params.chatId ? `Chat ${params.chatId}` : 'Chat sin identificar'

  if (params.accion === 'vinculado') {
    const base = `${chat} vinculado como chat de administración de Telegram`
    return actor ? `${base} por ${actor}` : base
  }

  const base = `${chat} desvinculado como chat de administración de Telegram`
  return params.vinculadoDesde ? `${base} (estaba vinculado desde ${params.vinculadoDesde})` : base
}

/**
 * Deja la fila de auditoría del vínculo o de la baja. Devuelve `true` si se
 * guardó, para que el llamante pueda distinguirlo en un test sin depender de
 * que la escritura silencie el error.
 */
export async function auditarChatAdmin(params: AuditarChatAdminParams): Promise<boolean> {
  const fecha = new Date().toISOString()
  const actor = describirActorTelegram(params.actorTelegram)

  const snapshot = {
    tenantId: params.tenantId,
    chatId: params.chatId ?? null,
    accion: params.accion,
    fecha,
    solicitadoPor: params.userId ?? null,
    telegram: params.actorTelegram
      ? {
          id: params.actorTelegram.id ?? null,
          username: params.actorTelegram.username ?? null,
          nombre: params.actorTelegram.nombre ?? null,
        }
      : null,
    ...(params.accion === 'desvinculado' ? { vinculadoDesde: params.vinculadoDesde ?? null } : {}),
  }

  try {
    await prisma.auditLog.create({
      data: {
        tenantId: params.tenantId,
        // La relación es opcional: el vínculo lo puede haber creado alguien
        // que ya no existe como usuario del panel (o nadie en concreto).
        userId: params.userId || null,
        accion:
          params.accion === 'vinculado'
            ? ACCION_CHAT_ADMIN_VINCULADO
            : ACCION_CHAT_ADMIN_DESVINCULADO,
        entidad: ENTIDAD_CHAT_ADMIN,
        entidadId: params.chatId || params.tenantId,
        descripcion: describir(params, actor),
        ...(params.accion === 'vinculado'
          ? { cambiosDespues: snapshot }
          : { cambiosAntes: snapshot }),
        metadata: { origen: 'telegram', fecha },
      },
    })
    return true
  } catch (error) {
    console.error('[TelegramAdminChat] No se pudo registrar la auditoría:', error)
    return false
  }
}
