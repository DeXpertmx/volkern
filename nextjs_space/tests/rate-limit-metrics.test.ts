// @vitest-environment node
//
// Test de las métricas de rate-limit del webhook: cuántos 429 se devuelven
// por chat y por día, con Redis (INCR + TTL) y fallback en memoria.

import { describe, it, expect, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  initRedis: vi.fn(),
  redisClient: {
    multi: vi.fn(),
    incr: vi.fn(),
    expire: vi.fn(),
    get: vi.fn(),
    scan: vi.fn(),
  },
}))

vi.mock('@/lib/core/redis', () => ({ initRedis: mocks.initRedis }))

import {
  recordRateLimited,
  getRateLimitMetrics,
  _clearMemoryMetrics,
} from '@/lib/telegram/rate-limit-metrics'

describe('Rate-limit metrics: registro', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    _clearMemoryMetrics()
  })

  it('registra un rechazo con INCR + TTL en Redis por chat y por canal', async () => {
    const multi = {
      incr: vi.fn().mockReturnThis(),
      expire: vi.fn().mockReturnThis(),
      set: vi.fn().mockReturnThis(),
      exec: vi.fn().mockResolvedValue([]),
    }
    mocks.initRedis.mockResolvedValue({ multi: vi.fn(() => multi) } as any)

    await recordRateLimited('telegram', '646107192')

    // Clave por chat: webhook:429:telegram:<chatId>:<YYYY-MM-DD>
    const today = new Date().toISOString().slice(0, 10)
    expect(multi.incr).toHaveBeenCalledWith(`webhook:429:telegram:646107192:${today}`)
    expect(multi.incr).toHaveBeenCalledWith(`webhook:429:total:telegram:${today}`)
    // 3 expires de las métricas (chat, total, last) + 1 del contador horario de
    // la alerta de abuso (recordRateLimited siempre la dispara, también con Redis)
    expect(multi.expire).toHaveBeenCalledTimes(4)
  })

  it('si Redis no está disponible, usa el fallback en memoria', async () => {
    mocks.initRedis.mockResolvedValue(null)

    await recordRateLimited('telegram', '646107192')
    await recordRateLimited('telegram', '646107192')
    await recordRateLimited('evolution', '5214421234567')

    const metrics = await getRateLimitMetrics()
    expect(metrics.today.telegram).toBe(2)
    expect(metrics.today.evolution).toBe(1)
    expect(metrics.today.total).toBe(3)

    // Top chats ordenado: el chat con más rechazos primero
    expect(metrics.topChats[0].chatId).toBe('646107192')
    expect(metrics.topChats[0].count).toBe(2)
  })

  it('el fallback en memoria registra lastRejectedAt y canal', async () => {
    mocks.initRedis.mockResolvedValue(null)

    await recordRateLimited('evolution', '5214421234567')

    const metrics = await getRateLimitMetrics()
    expect(metrics.lastRejectedChannel).toBe('evolution')
    expect(metrics.lastRejectedAt).toBeTruthy()
  })

  it('si Redis lanza error, degrada a memoria sin romper', async () => {
    mocks.initRedis.mockResolvedValue({
      multi: vi.fn(() => ({
        incr: vi.fn().mockReturnThis(),
        expire: vi.fn().mockReturnThis(),
        exec: vi.fn().mockRejectedValue(new Error('conn refused')),
      })),
    } as any)

    await recordRateLimited('telegram', '646107192')
    const metrics = await getRateLimitMetrics()
    // El fallback en memoria capturó el rechazo
    expect(metrics.today.telegram).toBe(1)
  })
})

describe('Rate-limit metrics: lectura desde Redis', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    _clearMemoryMetrics()
  })

  it('agrega totales por canal y top chats desde Redis', async () => {
    const today = new Date().toISOString().slice(0, 10)
    const getMock = vi.fn((key: string) => {
      if (key === `webhook:429:total:telegram:${today}`) return Promise.resolve('3')
      if (key === `webhook:429:total:evolution:${today}`) return Promise.resolve('1')
      // Total de ayer
      const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
      if (key === `webhook:429:total:telegram:${yesterday}`) return Promise.resolve('5')
      if (key === `webhook:429:total:evolution:${yesterday}`) return Promise.resolve('0')
      // Último rechazo
      if (key === 'webhook:429:last') {
        return Promise.resolve(JSON.stringify({ at: new Date().toISOString(), channel: 'telegram' }))
      }
      return Promise.resolve(null)
    })
    const scanMock = vi.fn()
      .mockResolvedValueOnce(['0', [`webhook:429:telegram:646107192:${today}`]])
      .mockResolvedValueOnce(['0', [`webhook:429:telegram:646107199:${today}`]])
      .mockResolvedValueOnce(['0', []])
      .mockResolvedValueOnce(['0', []])

    mocks.initRedis.mockResolvedValue({
      get: getMock,
      scan: scanMock,
    } as any)

    const metrics = await getRateLimitMetrics()

    expect(metrics.today.telegram).toBe(3)
    expect(metrics.today.evolution).toBe(1)
    expect(metrics.today.total).toBe(4)
    // Histórico: 7 días, el más reciente primero (hoy)
    expect(metrics.byDay.length).toBe(7)
    expect(metrics.byDay[0].date).toBe(today)
    // Último rechazo leído desde Redis
    expect(metrics.lastRejectedChannel).toBe('telegram')
    expect(metrics.lastRejectedAt).toBeTruthy()
    // El scan itera por canal (telegram y evolution por separado)
    expect(scanMock).toHaveBeenCalledWith('0', 'MATCH', `webhook:429:telegram:*:${today}`, 'COUNT', 200)
    expect(scanMock).toHaveBeenCalledWith('0', 'MATCH', `webhook:429:evolution:*:${today}`, 'COUNT', 200)
  })

  it('registra el último rechazo con canal en Redis', async () => {
    const multi = {
      incr: vi.fn().mockReturnThis(),
      expire: vi.fn().mockReturnThis(),
      set: vi.fn().mockReturnThis(),
      exec: vi.fn().mockResolvedValue([]),
    }
    mocks.initRedis.mockResolvedValue({ multi: vi.fn(() => multi) } as any)

    await recordRateLimited('evolution', '5214421234567')

    const setCall = multi.set.mock.calls[0]
    expect(setCall[0]).toBe('webhook:429:last')
    const parsed = JSON.parse(setCall[1])
    expect(parsed.channel).toBe('evolution')
    expect(parsed.at).toBeTruthy()
  })
})
