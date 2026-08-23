import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  userFindMany: vi.fn(),
  dealFindMany: vi.fn(),
  leadFindMany: vi.fn(),
  taskFindMany: vi.fn(),
  notifyByTelegram: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findMany: mocks.userFindMany },
    deal: { findMany: mocks.dealFindMany },
    lead: { findMany: mocks.leadFindMany },
    task: { findMany: mocks.taskFindMany },
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

describe('MorningBriefingService.generateBriefing — incluye tareas pendientes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.dealFindMany.mockResolvedValue([])
    mocks.leadFindMany.mockResolvedValue([])
    mocks.taskFindMany.mockResolvedValue([])
  })

  it('devuelve tareasPendientes con las vencidas primero', async () => {
    mocks.taskFindMany.mockResolvedValue([
      {
        id: 't-hoy',
        titulo: 'Llamar a Juan',
        fechaVencimiento: new Date(Date.now() + 3600e3),
        recordatorioPospuestoHasta: null,
        lead: { id: 'l1', nombre: 'Juan' },
      },
      {
        id: 't-vencida',
        titulo: 'Cerrar contrato',
        fechaVencimiento: new Date(Date.now() - 86400e3),
        recordatorioPospuestoHasta: null,
        lead: { id: 'l2', nombre: 'Ana' },
      },
    ])

    const briefing = await MorningBriefingService.generateBriefing('u1', 't1')

    expect(briefing.tareasPendientes).toHaveLength(2)
    expect(briefing.tareasPendientes[0].id).toBe('t-vencida')
    expect(briefing.tareasPendientes[0].vencida).toBe(true)
    expect(briefing.tareasPendientes[0].leadNombre).toBe('Ana')
    expect(briefing.tareasPendientes[1].id).toBe('t-hoy')
    expect(briefing.tareasPendientes[1].vencida).toBe(false)
    expect(briefing.tareasPendientes[1].leadId).toBe('l1')
  })

  it('devuelve lista vacía si no hay tareas pendientes', async () => {
    const briefing = await MorningBriefingService.generateBriefing('u1', 't1')

    expect(briefing.tareasPendientes).toEqual([])
  })

  it('excluye en la consulta las tareas snoozeadas y las del usuario o sin asignar', async () => {
    await MorningBriefingService.generateBriefing('u1', 't1')

    expect(mocks.taskFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: 't1',
          completada: false,
          AND: [{ OR: [{ asignadoA: 'u1' }, { asignadoA: null }] }],
          OR: [
            { recordatorioPospuestoHasta: null },
            { recordatorioPospuestoHasta: { lte: expect.any(Date) } },
          ],
        }),
      }),
    )
  })
})

describe('MorningBriefingService.sendGlobalBriefing — opt-in por usuario', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.userFindMany.mockResolvedValue([])
    mocks.dealFindMany.mockResolvedValue([])
    mocks.leadFindMany.mockResolvedValue([])
    mocks.taskFindMany.mockResolvedValue([])
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

  it('incluye las tareas pendientes en el mensaje de Telegram', async () => {
    mocks.userFindMany.mockResolvedValue([{ ...userBase, id: 'u-tareas', metadata: {} }])
    mocks.taskFindMany.mockResolvedValue([
      {
        id: 't-1',
        titulo: 'Confirmar cita',
        fechaVencimiento: new Date(Date.now() - 86400e3),
        recordatorioPospuestoHasta: null,
        lead: { id: 'l1', nombre: 'Alejandra' },
      },
    ])

    await MorningBriefingService.sendGlobalBriefing()

    const sent = mocks.notifyByTelegram.mock.calls[0][0] as string
    expect(sent).toContain('📋 *Pendientes importantes:*')
    expect(sent).toContain('Confirmar cita')
    expect(sent).toContain('Alejandra')
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
