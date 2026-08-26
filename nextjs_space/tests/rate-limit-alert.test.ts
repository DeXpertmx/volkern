// @vitest-environment node
//
// Test de la alerta de abuso del rate-limit: cuando un chat supera N rechazos
// 429 en una hora, se envía UNA alerta al desarrollador por Telegram (bot del
// sistema), con dedupe por chat/hora y fallback en memoria sin Redis.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  initRedis: vi.fn(),
  sendTelegramMessage: vi.fn(),
}))

vi.mock('@/lib/core/redis', () => ({ initRedis: mocks.initRedis }))
vi.mock('@/lib/telegram', () => ({ sendTelegramMessage: mocks.sendTelegramMessage }))

import { alertIfAbusive, _clearMemoryAlert } from '@/lib/telegram/rate-limit-alert'
import { recordRateLimited } from '@/lib/telegram/rate-limit-metrics'

/** Cliente Redis simulado: `multi().incr().expire().exec()` devuelve `count`. */
function redisWithHourCount(count: number) {
  const multi = {
    incr: vi.fn().mockReturnThis(),
    expire: vi.fn().mockReturnThis(),
    exec: vi.fn().mockResolvedValue([[null, count]]),
  }
  return {
    multi: vi.fn(() => multi),
    set: vi.fn().mockResolvedValue('OK'),
  }
}

describe('Alerta de abuso por rate-limit (429/hora)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    _clearMemoryAlert()
    process.env.TELEGRAM_ADMIN_CHAT_ID = '646107192'
    delete process.env.RATE_LIMIT_ALERT_THRESHOLD
    mocks.sendTelegramMessage.mockResolvedValue({ success: true })
    mocks.initRedis.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
    delete process.env.TELEGRAM_ADMIN_CHAT_ID
    delete process.env.RATE_LIMIT_ALERT_THRESHOLD
  })

  it('no alerta por debajo del umbral', async () => {
    mocks.initRedis.mockResolvedValue(redisWithHourCount(5) as any)

    await alertIfAbusive('telegram', '646107192')

    expect(mocks.sendTelegramMessage).not.toHaveBeenCalled()
  })

  it('alerta al superar el umbral con canal, chat, conteo y umbral', async () => {
    const redis = redisWithHourCount(12)
    mocks.initRedis.mockResolvedValue(redis as any)

    await alertIfAbusive('evolution', '5214499880002')

    expect(mocks.sendTelegramMessage).toHaveBeenCalledTimes(1)
    const [chatId, text] = mocks.sendTelegramMessage.mock.calls[0]
    expect(chatId).toBe('646107192')
    expect(text).toContain('evolution')
    expect(text).toContain('5214499880002')
    expect(text).toContain('12')
    expect(text).toContain('10')
    // Dedupe con EX en SEGUNDOS (2h): un PX haría expirar la clave en segundos
    // y se perdería el dedupe dentro de la misma hora.
    expect(redis.set).toHaveBeenCalledWith(
      expect.stringContaining('webhook:429:alerted:evolution:5214499880002:'),
      '1',
      'EX',
      7200,
      'NX'
    )
  })

  it('deduplica: solo UNA alerta por chat y hora', async () => {
    const redis = redisWithHourCount(15)
    // La primera llamada crea la clave de dedupe (OK); las siguientes ya existe (null)
    redis.set.mockResolvedValueOnce('OK').mockResolvedValue(null)
    mocks.initRedis.mockResolvedValue(redis as any)

    await alertIfAbusive('telegram', '646107192')
    await alertIfAbusive('telegram', '646107192')
    await alertIfAbusive('telegram', '646107192')

    expect(mocks.sendTelegramMessage).toHaveBeenCalledTimes(1)
  })

  it('en una hora nueva vuelve a alertar (dedupe por hora)', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-26T12:30:00Z'))

    const redis = redisWithHourCount(12)
    // hora 12: 1ª llamada crea la clave (OK), 2ª ya existe (null); hora 13: nueva (OK)
    redis.set.mockResolvedValueOnce('OK').mockResolvedValueOnce(null).mockResolvedValue('OK')
    mocks.initRedis.mockResolvedValue(redis as any)

    await alertIfAbusive('telegram', '646107192') // hora 12 → alerta 1
    await alertIfAbusive('telegram', '646107192') // misma hora → dedupe

    vi.setSystemTime(new Date('2026-08-26T13:05:00Z'))
    await alertIfAbusive('telegram', '646107192') // hora 13 → alerta 2

    expect(mocks.sendTelegramMessage).toHaveBeenCalledTimes(2)
  })

  it('respeta el umbral configurado por env', async () => {
    process.env.RATE_LIMIT_ALERT_THRESHOLD = '3'
    mocks.initRedis.mockResolvedValue(redisWithHourCount(3) as any)

    await alertIfAbusive('telegram', '646107192')

    expect(mocks.sendTelegramMessage).toHaveBeenCalledTimes(1)
    expect(mocks.sendTelegramMessage.mock.calls[0][1]).toContain('Umbral: 3')
  })

  it('usa el fallback en memoria sin Redis (contador + dedupe)', async () => {
    process.env.RATE_LIMIT_ALERT_THRESHOLD = '3'
    mocks.initRedis.mockResolvedValue(null)

    await alertIfAbusive('telegram', '646107192') // 1
    await alertIfAbusive('telegram', '646107192') // 2
    await alertIfAbusive('telegram', '646107192') // 3 → umbral
    await alertIfAbusive('telegram', '646107192') // dedupe en memoria

    expect(mocks.sendTelegramMessage).toHaveBeenCalledTimes(1)
    expect(mocks.sendTelegramMessage.mock.calls[0][1]).toContain('Rechazos 429 en la última hora: 3')
  })

  it('sin TELEGRAM_ADMIN_CHAT_ID no envía pero no rompe', async () => {
    delete process.env.TELEGRAM_ADMIN_CHAT_ID
    mocks.initRedis.mockResolvedValue(redisWithHourCount(12) as any)

    await expect(alertIfAbusive('telegram', '646107192')).resolves.toBeUndefined()
    expect(mocks.sendTelegramMessage).not.toHaveBeenCalled()
  })

  it('regresión: con Redis OK, recordRateLimited también dispara la alerta', async () => {
    // Bug: el `return` temprano del try de Redis en recordRateLimited impedía
    // llegar a alertIfAbusive cuando Redis estaba disponible (producción).
    process.env.RATE_LIMIT_ALERT_THRESHOLD = '1'
    const multi = {
      incr: vi.fn().mockReturnThis(),
      expire: vi.fn().mockReturnThis(),
      set: vi.fn().mockReturnThis(),
      exec: vi.fn().mockResolvedValue([[null, 1]]),
    }
    const redis = {
      multi: vi.fn(() => multi),
      set: vi.fn().mockResolvedValue('OK'),
    }
    mocks.initRedis.mockResolvedValue(redis as any)

    await recordRateLimited('telegram', '646107192')

    expect(mocks.sendTelegramMessage).toHaveBeenCalledTimes(1)
  })
})
