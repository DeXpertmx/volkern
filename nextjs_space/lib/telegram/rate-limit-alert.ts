/**
 * Alerta por Telegram al desarrollador cuando un chat supera N rechazos 429
 * en una hora, para detectar abuso en tiempo real (un bot/script martillando
 * el webhook de Telegram o WhatsApp).
 *
 * Solo avisos de SISTEMA (sin datos de tenant): canal y chat id. Va por el
 * bot del sistema (`volkerncrm_bot`, TELEGRAM_BOT_TOKEN) al chat del
 * desarrollador (TELEGRAM_ADMIN_CHAT_ID), nunca por el bot de un tenant —
 * ver `documentacion_tecnica/TELEGRAM_ARQUITECTURA.md`.
 *
 * Semántica:
 *   - Contador por hora por chat en Redis: `webhook:429:hour:<ns>:<chatId>:<HORA>`
 *     con `INCR` + TTL (2 h). La hora es UTC en formato `YYYY-MM-DDTHH`.
 *   - Cuando el contador llega al umbral, se envía la alerta UNA vez por chat
 *     y hora: dedupe con `SET webhook:429:alerted:<ns>:<chatId>:<HORA> 1 PX NX`
 *     (solo la instancia que crea la clave envía; las demás se descartan).
 *   - Si Redis no está disponible, fallback en memoria (misma semántica).
 */

import { initRedis } from '@/lib/core/redis'
import { sendTelegramMessage } from '@/lib/telegram'
import type { WebhookNamespace } from './rate-limit-metrics'

// TTL de las claves horarias (2 h: la ventana de 1 h + margen para que el
// panel pueda leer la hora recién terminada)
const HOUR_TTL_SECONDS = 2 * 3600
// TTL de la clave de dedupe (misma ventana: no volver a alertar esa hora)
const ALERT_TTL_SECONDS = 2 * 3600

/** Umbral por defecto: N rechazos 429 en una hora = posible abuso. */
const DEFAULT_THRESHOLD = 10

export function alertThreshold(): number {
  const raw = process.env.RATE_LIMIT_ALERT_THRESHOLD
  if (!raw) return DEFAULT_THRESHOLD
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : DEFAULT_THRESHOLD
}

/** Hora actual en UTC: `YYYY-MM-DDTHH` (ventana horaria del contador). */
function currentHourKey(): string {
  return new Date().toISOString().slice(0, 13)
}

function developerChatId(): string | null {
  return process.env.TELEGRAM_ADMIN_CHAT_ID || null
}

// ─── Fallback en memoria (una sola instancia, sin Redis) ─────────────────
// Key: `${namespace}:${chatId}:${hour}` -> contador
const memHourCount = new Map<string, number>()
// Key: `${namespace}:${chatId}:${hour}` -> ya se alertó
const memAlerted = new Set<string>()

function incrementMemory(namespace: WebhookNamespace, chatId: string, hour: string): number {
  const key = `${namespace}:${chatId}:${hour}`
  const next = (memHourCount.get(key) ?? 0) + 1
  memHourCount.set(key, next)
  // Limpieza simple: purgar horas pasadas si el mapa crece demasiado
  if (memHourCount.size > 2000) {
    for (const k of memHourCount.keys()) {
      if (!k.endsWith(hour)) memHourCount.delete(k)
    }
  }
  return next
}

function alreadyAlertedMemory(key: string): boolean {
  return memAlerted.has(key)
}

function markAlertedMemory(key: string): void {
  memAlerted.add(key)
  if (memAlerted.size > 2000) {
    const hour = currentHourKey()
    for (const k of memAlerted) {
      if (!k.endsWith(hour)) memAlerted.delete(k)
    }
  }
}

/**
 * Comprueba si un chat superó el umbral de rechazos 429 en la hora actual y,
 * en ese caso, envía la alerta al desarrollador (una vez por chat y hora).
 * Fire-and-forget: cualquier fallo interno se loguea y nunca rompe el webhook.
 */
export async function alertIfAbusive(
  namespace: WebhookNamespace,
  chatId: string
): Promise<void> {
  const threshold = alertThreshold()
  const hour = currentHourKey()

  // 1. Incrementar el contador horario y obtener el valor actual
  let count: number
  const redis = await initRedis()
  if (redis) {
    try {
      const hourlyKey = `webhook:429:hour:${namespace}:${chatId}:${hour}`
      const results = await redis
        .multi()
        .incr(hourlyKey)
        .expire(hourlyKey, HOUR_TTL_SECONDS)
        .exec()
      // ioredis: cada elemento es [error, resultado]; el INCR devuelve el valor
      count = Number(results?.[0]?.[1] ?? 0)
    } catch (error) {
      console.warn('[RateLimitAlert] Redis falló, usando memoria:', (error as Error).message)
      count = incrementMemory(namespace, chatId, hour)
    }
  } else {
    count = incrementMemory(namespace, chatId, hour)
  }

  if (count < threshold) return

  // 2. Dedupe: solo UNA alerta por chat y hora (la instancia que crea la clave)
  const alertedKey = `webhook:429:alerted:${namespace}:${chatId}:${hour}`
  let shouldSend = false
  if (redis) {
    try {
      const created = await redis.set(alertedKey, '1', 'PX', ALERT_TTL_SECONDS, 'NX')
      // null = la clave ya existía (otra instancia ya alertó esta hora)
      shouldSend = created !== null
    } catch (error) {
      console.warn('[RateLimitAlert] Redis falló en el dedupe, usando memoria:', (error as Error).message)
      shouldSend = !alreadyAlertedMemory(alertedKey)
      if (shouldSend) markAlertedMemory(alertedKey)
    }
  } else {
    shouldSend = !alreadyAlertedMemory(alertedKey)
    if (shouldSend) markAlertedMemory(alertedKey)
  }
  if (!shouldSend) return

  // 3. Enviar al desarrollador por el bot del sistema
  const chat = developerChatId()
  if (!chat) {
    console.warn('[RateLimitAlert] TELEGRAM_ADMIN_CHAT_ID no configurado; no se envió la alerta.')
    return
  }

  const text = [
    '🚨 Posible abuso en el webhook',
    '',
    `Canal: ${namespace}`,
    `Chat: ${chatId}`,
    `Rechazos 429 en la última hora: ${count}`,
    `Umbral: ${threshold}`,
    `Hora: ${hour} UTC`,
    '',
    'Si es un bot o script automatizado, revisa los logs del webhook.',
  ].join('\n')

  try {
    const res = await sendTelegramMessage(chat, text)
    if (!res.success) {
      console.error('[RateLimitAlert] Error enviando la alerta:', res.error)
    }
  } catch (error) {
    console.error('[RateLimitAlert] Excepción enviando la alerta:', error)
  }
}

/** Limpieza del store en memoria (solo tests). */
export function _clearMemoryAlert() {
  memHourCount.clear()
  memAlerted.clear()
}
