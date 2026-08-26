/**
 * Avisos al desarrollador por Telegram (bot del sistema `volkerncrm_bot`) para
 * acciones sensibles que reconfiguran el estado del sistema (conectar/desconectar
 * integraciones con credenciales externas, reiniciar métricas, etc.).
 *
 * Solo avisos de SISTEMA, sin datos sensibles (nunca se envían credenciales ni
 * tokens). Va al chat del desarrollador (TELEGRAM_ADMIN_CHAT_ID). Fire-and-forget:
 * un fallo de envío o de entorno nunca debe romper la acción que lo originó.
 */

import { sendTelegramMessage } from '@/lib/telegram'

export interface SensitiveActionInfo {
  /** Título corto de la alerta (con emoji). p.ej. '🔌 Integración conectada' */
  title: string
  /** Qué se hizo, para el mensaje. p.ej. 'Conectada integración stripe' */
  accion: string
  /** Detalle contextual: tenant, tipo, entidad. */
  detalle: string
  /** Quién lo hizo (nombre/email). */
  quien: string
  /** Id del usuario actor. */
  userId?: string | null
  /** Calificador extra opcional (p.ej. tipo de integración). */
  extra?: string
}

function developerChatId(): string | null {
  return process.env.TELEGRAM_ADMIN_CHAT_ID || null
}

/**
 * Envía un aviso al desarrollador por el bot del sistema. Nunca lanza: cualquier
 * error se loguea y se degrada silenciosamente para no romper la acción original.
 */
export async function notifyDeveloperSensitiveAction(info: SensitiveActionInfo) {
  const chat = developerChatId()
  if (!chat) {
    console.warn('[DevNotify] TELEGRAM_ADMIN_CHAT_ID no configurado; no se envió el aviso.')
    return
  }

  const lines = [
    info.title,
    '',
    `Acción: ${info.accion}`,
    `Detalle: ${info.detalle}`,
    `Quién: ${info.quien}`,
  ]
  if (info.userId) lines.push(`UserId: ${info.userId}`)
  if (info.extra) lines.push(info.extra)
  lines.push(`Fecha: ${new Date().toISOString()}`)
  lines.push('', 'Acción sensible registrada en el audit log.')

  try {
    const res = await sendTelegramMessage(chat, lines.join('\n'))
    if (!res.success) {
      console.error('[DevNotify] Error enviando el aviso:', res.error)
    }
  } catch (error) {
    console.error('[DevNotify] Excepción enviando el aviso:', error)
  }
}