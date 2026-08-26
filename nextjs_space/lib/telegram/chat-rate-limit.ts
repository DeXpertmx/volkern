/**
 * Rate-limit por chat compartido entre todas las instancias del webhook de
 * Telegram.
 *
 * Antes vivía como un Map en memoria dentro del route: con varias réplicas o
 * workers, cada proceso tenía su propio contador y el límite no se respetaba
 * de forma global. Ahora usa Redis con `SET key value PX NX` (atómico), que
 * replica exactamente la semántica de "ventana deslizante": si la clave existe
 * dentro de la ventana, el mensaje está rate-limiteado; si expiró, se crea de
 * nuevo y pasa. Si Redis no está disponible, se degrada al Map en memoria.
 */

import { initRedis } from '@/lib/core/redis'

// Ventana por chat (misma semántica que el antiguo RATE_LIMIT_WINDOW_MS)
const RATE_LIMIT_WINDOW_MS = 1500

// Umbral bajo para limpieza de caches in-memory en instancias warm
const LRU_CLEANUP_THRESHOLD = 1000

// ─── Fallback en memoria (una sola instancia, sin Redis) ─────────────────
const lastCallByChat = new Map<string, number>()

function isRateLimitedLocal(chatId: string): boolean {
  const now = Date.now()
  const last = lastCallByChat.get(chatId)
  if (last !== undefined && now - last < RATE_LIMIT_WINDOW_MS) {
    return true
  }
  lastCallByChat.set(chatId, now)
  if (lastCallByChat.size > LRU_CLEANUP_THRESHOLD) {
    const cutoff = now - RATE_LIMIT_WINDOW_MS * 10
    for (const [k, v] of lastCallByChat) {
      if (v < cutoff) lastCallByChat.delete(k)
    }
  }
  return false
}

// ─── Rate-limit compartido (Redis con fallback) ──────────────────────────

/**
 * ¿El chat está rate-limiteado en la ventana actual?
 *
 * Redis: `SET telegram:rl:<chatId> 1 PX 1500 NX`. Si la clave ya existe
 * (retorno null), el chat ya envió en la ventana → limitado. Si se creó
 * (retorno OK), es la primera llamada en la ventana → pasa.
 */
export async function isChatRateLimited(chatId: string): Promise<boolean> {
  const redis = await initRedis()
  if (redis) {
    try {
      const key = `telegram:rl:${chatId}`
      const result = await redis.set(key, '1', 'PX', RATE_LIMIT_WINDOW_MS, 'NX')
      // null = la clave ya existía (mensaje anterior en la ventana) → limitado
      return result === null
    } catch (error) {
      console.warn('[TelegramWebhook] Redis rate-limit falló, usando fallback en memoria:', (error as Error).message)
    }
  }
  return isRateLimitedLocal(chatId)
}
