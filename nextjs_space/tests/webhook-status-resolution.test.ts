// @vitest-environment node
//
// Tests del resolutor de identidades de chat (nombre real de contacto/lead/usuario
// detrás de un chatId) y del reset de métricas del día.

import { describe, it, expect, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  initRedis: vi.fn(),
  prisma: {
    user: { findMany: vi.fn() },
    lead: { findFirst: vi.fn() },
    contact: { findFirst: vi.fn() },
  },
}))

vi.mock('@/lib/core/redis', () => ({ initRedis: mocks.initRedis }))
vi.mock('@/lib/db', () => ({ prisma: mocks.prisma }))

import { resolveChatIdentities } from '@/lib/telegram/chat-resolver'
import { resetRateLimitMetrics, _clearMemoryMetrics, recordRateLimited } from '@/lib/telegram/rate-limit-metrics'

describe('chat-resolver: resolver nombres reales', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('resuelve un chat de Telegram a un User vinculado por /start', async () => {
    mocks.prisma.user.findMany.mockResolvedValue([
      { id: 'u1', name: 'Bruno Hess', metadata: { telegram_chat_id: '646107192' } },
    ])
    mocks.prisma.lead.findFirst.mockResolvedValue(null)

    const map = await resolveChatIdentities('telegram', ['646107192'])
    const ident = map.get('646107192')!
    expect(ident.name).toBe('Bruno Hess')
    expect(ident.kind).toBe('user')
  })

  it('resuelve un chat de Telegram a un Lead por externalContactRef', async () => {
    mocks.prisma.user.findMany.mockResolvedValue([])
    mocks.prisma.lead.findFirst.mockResolvedValue({ nombre: 'María López' })

    const map = await resolveChatIdentities('telegram', ['555000111'])
    expect(map.get('555000111')!.name).toBe('María López')
  })

  it('resuelve un número de WhatsApp a un Contacto', async () => {
    mocks.prisma.contact.findFirst.mockResolvedValue({ nombre: 'Carlos Ruiz' })

    const map = await resolveChatIdentities('evolution', ['5214499880002'])
    expect(map.get('5214499880002')!.name).toBe('Carlos Ruiz')
    expect(map.get('5214499880002')!.kind).toBe('contact')
  })

  it('resuelve un número de WhatsApp a un Lead si no hay Contacto', async () => {
    mocks.prisma.contact.findFirst.mockResolvedValue(null)
    mocks.prisma.lead.findFirst.mockResolvedValue({ nombre: 'Ana Torres' })

    const map = await resolveChatIdentities('evolution', ['5214499880003'])
    expect(map.get('5214499880003')!.name).toBe('Ana Torres')
  })

  it('deja el id crudo si no encuentra nada o falla la consulta', async () => {
    mocks.prisma.user.findMany.mockRejectedValue(new Error('db down'))

    const map = await resolveChatIdentities('telegram', ['777888999'])
    expect(map.get('777888999')!.name).toBe('777888999')
    expect(map.get('777888999')!.kind).toBeNull()
  })
})

describe('resetRateLimitMetrics', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    _clearMemoryMetrics()
    mocks.initRedis.mockReset()
  })

  it('borra las claves del día en Redis (por chat, totales y last)', async () => {
    const today = new Date().toISOString().slice(0, 10)
    const del = vi.fn().mockResolvedValue(1)
    mocks.initRedis.mockResolvedValue({
      scan: vi.fn()
        .mockResolvedValueOnce(['0', [`webhook:429:telegram:646107192:${today}`]])
        .mockResolvedValueOnce(['0', []]),
      del,
    } as any)

    const res = await resetRateLimitMetrics()
    expect(res.reset).toBe(true)
    // Borra la clave por chat + el total del día + last, para ambos canales
    const keys = del.mock.calls[0].flat()
    expect(keys).toContain(`webhook:429:telegram:646107192:${today}`)
    expect(keys).toContain(`webhook:429:total:telegram:${today}`)
    expect(keys).toContain(`webhook:429:total:evolution:${today}`)
    expect(keys).toContain('webhook:429:last')
  })

  it('borra también el fallback en memoria', async () => {
    mocks.initRedis.mockResolvedValue(null)
    await recordRateLimited('telegram', '646107192')

    const before = await import('@/lib/telegram/rate-limit-metrics').then((m) => m.getRateLimitMetrics())
    expect(before.today.telegram).toBeGreaterThan(0)

    await resetRateLimitMetrics()

    const after = await import('@/lib/telegram/rate-limit-metrics').then((m) => m.getRateLimitMetrics())
    expect(after.today.telegram).toBe(0)
    expect(after.topChats).toHaveLength(0)
  })
})