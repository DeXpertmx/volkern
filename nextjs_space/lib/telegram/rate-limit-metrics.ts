/**
 * Métricas de rate-limit del webhook: cuántos mensajes se rechazan con 429
 * por chat y por día.
 *
 * Se registra cada rechazo (cuando `isChatRateLimited` devuelve true) con un
 * contador diario:
 *   - Redis (compartido entre instancias): `webhook:429:<ns>:<chatId>:<YYYY-MM-DD>`
 *     con `INCR` + TTL (7 días) para poder mostrar los últimos días; y un total
 *     por canal/día `webhook:429:total:<ns>:<YYYY-MM-DD>` para el resumen rápido.
 *   - Fallback en memoria si Redis no está disponible (igual que el rate-limit
 *     que registra estas métricas).
 */

import { initRedis } from '@/lib/core/redis'
import { alertIfAbusive } from './rate-limit-alert'

// TTL de las claves de métricas (7 días: suficiente para el panel de últimos días)
const METRICS_TTL_SECONDS = 7 * 24 * 3600

export type WebhookNamespace = 'telegram' | 'evolution'

export interface ChatRateLimitMetric {
  chatId: string
  /** Número de mensajes rechazados con 429 */
  count: number
}

export interface DayRateLimitMetric {
  /** Fecha en formato YYYY-MM-DD */
  date: string
  telegram: number
  evolution: number
  total: number
}

export interface WebhookRateLimitMetrics {
  /** Resumen de hoy por canal */
  today: {
    telegram: number
    evolution: number
    total: number
  }
  /** Top chats con más 429 (hoy), ordenados desc */
  topChats: ChatRateLimitMetric[]
  /** Últimos 7 días (incluido hoy), el más reciente primero */
  byDay: DayRateLimitMetric[]
  /** Timestamp del último registro */
  lastRejectedAt: string | null
  /** Canal del último registro */
  lastRejectedChannel: WebhookNamespace | null
}

// ─── Fallback en memoria (una sola instancia, sin Redis) ─────────────────
interface MemEntry {
  count: number
  lastAt: string
}
// Key: `${namespace}:${chatId}:${date}`
const memByChat = new Map<string, MemEntry>()
// Key: `${namespace}:${date}`
const memByChannelDay = new Map<string, MemEntry>()

function todayKey(): string {
  return new Date().toISOString().slice(0, 10)
}

function dayKeyFor(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function daysAgoKey(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return dayKeyFor(d)
}

// ─── Registro ─────────────────────────────────────────────────────────────

/**
 * Registra un rechazo 429 del webhook para un chat y canal concretos.
 * Llamada desde `isChatRateLimited` cuando devuelve true.
 */
export async function recordRateLimited(
  namespace: WebhookNamespace,
  chatId: string
): Promise<void> {
  const date = todayKey()
  const lastAt = new Date().toISOString()

  const redis = await initRedis()
  if (redis) {
    try {
      const chatKey = `webhook:429:${namespace}:${chatId}:${date}`
      const totalKey = `webhook:429:total:${namespace}:${date}`
      const lastKey = 'webhook:429:last'
      await redis
        .multi()
        .incr(chatKey)
        .expire(chatKey, METRICS_TTL_SECONDS)
        .incr(totalKey)
        .expire(totalKey, METRICS_TTL_SECONDS)
        .set(lastKey, JSON.stringify({ at: lastAt, channel: namespace }))
        .expire(lastKey, METRICS_TTL_SECONDS)
        .exec()
      return
    } catch (error) {
      console.warn('[WebhookMetrics] Redis falló, usando fallback en memoria:', (error as Error).message)
    }
  }

  const chatEntry = memByChat.get(`${namespace}:${chatId}:${date}`)
  memByChat.set(`${namespace}:${chatId}:${date}`, {
    count: (chatEntry?.count ?? 0) + 1,
    lastAt,
  })
  const dayEntry = memByChannelDay.get(`${namespace}:${date}`)
  memByChannelDay.set(`${namespace}:${date}`, {
    count: (dayEntry?.count ?? 0) + 1,
    lastAt,
  })

  // Alerta de abuso (fire-and-forget): si un chat supera el umbral de 429 en
  // una hora, se avisa al desarrollador por Telegram. Nunca debe romper el
  // webhook, por eso se captura cualquier error.
  alertIfAbusive(namespace, chatId).catch((error) => {
    console.warn('[WebhookMetrics] Error en alerta de abuso:', error)
  })
}

// ─── Lectura ──────────────────────────────────────────────────────────────

/**
 * Devuelve las métricas agregadas: total de hoy por canal, top chats con más
 * 429 (hoy) y el histórico de los últimos 7 días.
 */
export async function getRateLimitMetrics(): Promise<WebhookRateLimitMetrics> {
  const redis = await initRedis()
  if (redis) {
    try {
      return await readFromRedis(redis)
    } catch (error) {
      console.warn('[WebhookMetrics] Redis falló al leer, usando fallback en memoria:', (error as Error).message)
    }
  }
  return readFromMemory()
}

async function readFromRedis(redis: NonNullable<Awaited<ReturnType<typeof initRedis>>>): Promise<WebhookRateLimitMetrics> {
  const today = todayKey()
  const channels: WebhookNamespace[] = ['telegram', 'evolution']

  // Totales de hoy por canal
  const todayCounts: Record<WebhookNamespace, number> = { telegram: 0, evolution: 0 }
  for (const ns of channels) {
    const val = await redis.get(`webhook:429:total:${ns}:${today}`)
    todayCounts[ns] = val ? Number(val) : 0
  }

  // Top chats de hoy: scan de las claves por chat del día, iterando por
  // canal para no matchear las claves `total` (webhook:429:total:<ns>:<date>).
  const chatCounts = new Map<string, number>()
  for (const ns of channels) {
    let cursor = '0'
    do {
      const [next, keys] = await redis.scan(cursor, 'MATCH', `webhook:429:${ns}:*:${today}`, 'COUNT', 200)
      cursor = next
      for (const key of keys) {
        const parts = key.split(':')
        // webhook:429:<ns>:<chatId>:<date>
        const chatId = parts[3]
        const value = await redis.get(key)
        if (chatId && value) {
          chatCounts.set(chatId, (chatCounts.get(chatId) ?? 0) + Number(value))
        }
      }
    } while (cursor !== '0')
  }

  const topChats = Array.from(chatCounts.entries())
    .map(([chatId, count]) => ({ chatId, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)

  // Últimos 7 días (incluido hoy)
  const byDay: DayRateLimitMetric[] = []
  for (let i = 0; i < 7; i++) {
    const date = daysAgoKey(i)
    const counts: Record<WebhookNamespace, number> = { telegram: 0, evolution: 0 }
    for (const ns of channels) {
      const val = await redis.get(`webhook:429:total:${ns}:${date}`)
      counts[ns] = val ? Number(val) : 0
    }
    byDay.push({
      date,
      telegram: counts.telegram,
      evolution: counts.evolution,
      total: counts.telegram + counts.evolution,
    })
  }

  // Último rechazo registrado (cualquier canal)
  let lastRejectedAt: string | null = null
  let lastRejectedChannel: WebhookNamespace | null = null
  try {
    const lastRaw = await redis.get('webhook:429:last')
    if (lastRaw) {
      const parsed = JSON.parse(lastRaw)
      if (parsed.at) lastRejectedAt = parsed.at
      if (parsed.channel === 'telegram' || parsed.channel === 'evolution') {
        lastRejectedChannel = parsed.channel
      }
    }
  } catch {
    // el último rechazo es informativo; no romper la lectura
  }

  return {
    today: {
      telegram: todayCounts.telegram,
      evolution: todayCounts.evolution,
      total: todayCounts.telegram + todayCounts.evolution,
    },
    topChats,
    byDay,
    lastRejectedAt,
    lastRejectedChannel,
  }
}

function readFromMemory(): WebhookRateLimitMetrics {
  const today = todayKey()
  const channels: WebhookNamespace[] = ['telegram', 'evolution']

  const todayCounts: Record<WebhookNamespace, number> = { telegram: 0, evolution: 0 }
  const chatCounts = new Map<string, number>()
  let lastRejectedAt: string | null = null
  let lastRejectedChannel: WebhookNamespace | null = null

  for (const [key, entry] of memByChat) {
    const [ns, chatId, date] = key.split(':')
    if (date === today) {
      chatCounts.set(chatId, (chatCounts.get(chatId) ?? 0) + entry.count)
    }
    if (entry.lastAt > (lastRejectedAt ?? '')) {
      lastRejectedAt = entry.lastAt
      lastRejectedChannel = (ns as WebhookNamespace) || null
    }
  }

  for (const [key, entry] of memByChannelDay) {
    const [ns, date] = key.split(':')
    if (date === today && (ns === 'telegram' || ns === 'evolution')) {
      todayCounts[ns as WebhookNamespace] += entry.count
    }
    if (entry.lastAt > (lastRejectedAt ?? '')) {
      lastRejectedAt = entry.lastAt
      lastRejectedChannel = (ns as WebhookNamespace) || null
    }
  }

  const topChats = Array.from(chatCounts.entries())
    .map(([chatId, count]) => ({ chatId, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)

  const byDay: DayRateLimitMetric[] = []
  for (let i = 0; i < 7; i++) {
    const date = daysAgoKey(i)
    const counts: Record<WebhookNamespace, number> = { telegram: 0, evolution: 0 }
    for (const [key, entry] of memByChannelDay) {
      const [ns, d] = key.split(':')
      if (d === date && (ns === 'telegram' || ns === 'evolution')) {
        counts[ns as WebhookNamespace] += entry.count
      }
    }
    byDay.push({
      date,
      telegram: counts.telegram,
      evolution: counts.evolution,
      total: counts.telegram + counts.evolution,
    })
  }

  return {
    today: {
      telegram: todayCounts.telegram,
      evolution: todayCounts.evolution,
      total: todayCounts.telegram + todayCounts.evolution,
    },
    topChats,
    byDay,
    lastRejectedAt,
    lastRejectedChannel,
  }
}

/** Limpieza del store en memoria (solo tests). */
export function _clearMemoryMetrics() {
  memByChat.clear()
  memByChannelDay.clear()
}
