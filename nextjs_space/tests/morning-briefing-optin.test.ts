import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  userFindMany: vi.fn(),
  dealFindMany: vi.fn(),
  leadFindMany: vi.fn(),
  notifyByTelegram: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findMany: mocks.userFindMany },
    deal: { findMany: mocks.dealFindMany },
    lead: { findMany: mocks.leadFindMany },
  },
}))

vi.mock('@/lib/ai/gemma-client', () => ({
  callGemma: vi.fn().mockResolvedValue({
    error: null,
    content: JSON.stringify({
      topDeals: [],
      riskyDeals: [],
      newDiamonds: [],
      motivationalQuote: 'Hoy es un gran día.',
    }),
  }),
}))

vi.mock('@/lib/skills/notification-layer', () => ({
  notifyByTelegram: (...args: unknown[]) => mocks.notifyByTelegram(...args),
}))

vi.mock('@/lib/skills/context', () => ({
  createSystemContext: () => ({ tenantId: 't1' }),
}))

import { MorningBriefingService } from '@/lib/sales/morning-briefing-service'

const userBase = {
  id: 'u1',
  name: 'Bruno',
  active: true,
  tenantId: 't1',
  metadata: {},
}

describe('MorningBriefingService.sendGlobalBriefing — opt-in por usuario', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.userFindMany.mockResolvedValue([])
    mocks.dealFindMany.mockResolvedValue([])
    mocks.leadFindMany.mockResolvedValue([])
    mocks.notifyByTelegram.mockResolvedValue(true)
  })

  it('envía briefing a usuarios con preferencia activada o sin configurar (default activo)', async () => {
    mocks.userFindMany.mockResolvedValue([
      { ...userBase, id: 'u-activo', metadata: { notifications: { briefing: true } } },
      { ...userBase, id: 'u-default', metadata: {} },
    ])

    await MorningBriefingService.sendGlobalBriefing()

    // Cada usuario genera su briefing y se envía por Telegram
    expect(mocks.notifyByTelegram).toHaveBeenCalledTimes(2)
  })

  it('omite usuarios con briefing desactivado (notifications.briefing === false)', async () => {
    mocks.userFindMany.mockResolvedValue([
      { ...userBase, id: 'u-activo', metadata: { notifications: { briefing: true } } },
      { ...userBase, id: 'u-desactivado', metadata: { notifications: { briefing: false } } },
    ])

    await MorningBriefingService.sendGlobalBriefing()

    expect(mocks.notifyByTelegram).toHaveBeenCalledTimes(1)
  })

  it('no envía nada si no hay usuarios', async () => {
    mocks.userFindMany.mockResolvedValue([])

    await MorningBriefingService.sendGlobalBriefing()

    expect(mocks.notifyByTelegram).not.toHaveBeenCalled()
  })

  it('sobrevive a errores individuales (un usuario falla, el resto sigue)', async () => {
    mocks.userFindMany.mockResolvedValue([
      { ...userBase, id: 'u-error', metadata: {} },
      { ...userBase, id: 'u-ok', metadata: { notifications: { briefing: true } } },
    ])
    mocks.dealFindMany.mockRejectedValueOnce(new Error('boom'))

    await MorningBriefingService.sendGlobalBriefing()

    // El primer usuario falla al generar (el error se captura y no rompe el loop);
    // el segundo envía con normalidad.
    expect(mocks.notifyByTelegram).toHaveBeenCalledTimes(1)
  })
})
