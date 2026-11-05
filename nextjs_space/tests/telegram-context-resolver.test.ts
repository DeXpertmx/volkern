/**
 * Resolución de contexto de Telegram: un chat = un tenant.
 *
 * Regresión de la fuga que hacía que (a) el webhook contestara con los datos
 * de un tenant arbitrario (antiguo fallback «primera integración activa») y
 * (b) las notificaciones de otros tenants cayeran en el mismo chat personal.
 *
 * Ver `lib/telegram/context-resolver.ts` y
 * `documentacion_tecnica/TELEGRAM_ARQUITECTURA.md` §2.
 */
// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const prisma = {
    integration: { findMany: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    channel: { findMany: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    user: { findMany: vi.fn(), update: vi.fn() },
    conversation: { findFirst: vi.fn() },
  }
  return { prisma }
})

vi.mock('@/lib/db', () => ({ prisma: mocks.prisma, default: mocks.prisma }))
vi.mock('@/lib/core/crypto', () => ({
  encrypt: (s: string) => `enc(${s})`,
  decrypt: (s: string) => s.replace(/^enc\((.*)\)$/, '$1'),
}))

const resolver = await import('../lib/telegram/context-resolver')

const CHAT = '646107192'

beforeEach(() => {
  vi.clearAllMocks()
  // Por defecto: sin vínculos, sin historial y sin bots en el sistema.
  mocks.prisma.integration.findMany.mockResolvedValue([])
  mocks.prisma.channel.findMany.mockResolvedValue([])
  mocks.prisma.user.findMany.mockResolvedValue([])
  mocks.prisma.conversation.findFirst.mockResolvedValue(null)
  mocks.prisma.integration.findFirst.mockResolvedValue(null)
  mocks.prisma.channel.findFirst.mockResolvedValue(null)
  mocks.prisma.integration.update.mockResolvedValue({})
  mocks.prisma.channel.update.mockResolvedValue({})
  mocks.prisma.user.update.mockResolvedValue({})
})

describe('resolverContextoTelegram — nunca elige un tenant al azar', () => {
  it('un solo tenant vinculado por integración → ese tenant y su bot', async () => {
    mocks.prisma.integration.findMany.mockResolvedValue([
      { tenantId: 'tenant-mio', credenciales: { admin_chat_id: CHAT, bot_token: 'token-mio' } },
    ])
    mocks.prisma.integration.findFirst.mockResolvedValue({
      credenciales: { admin_chat_id: CHAT, bot_token: 'token-mio' },
    })

    const ctx = await resolver.resolverContextoTelegram(CHAT)
    expect(ctx).toEqual({ tenantId: 'tenant-mio', botToken: 'token-mio' })
  })

  it('un solo tenant vinculado por canal moderno (token cifrado) → ese tenant', async () => {
    mocks.prisma.channel.findMany.mockResolvedValue([
      { tenantId: 'tenant-canal', config: { adminChatId: CHAT, botToken: 'enc(123:abc)' } },
    ])
    mocks.prisma.channel.findFirst.mockResolvedValue({
      config: { adminChatId: CHAT, botToken: 'enc(123:abc)' },
    })

    const ctx = await resolver.resolverContextoTelegram(CHAT)
    expect(ctx).toEqual({ tenantId: 'tenant-canal', botToken: '123:abc' })
  })

  it('un solo tenant vinculado como usuario (QR del perfil) → ese tenant', async () => {
    mocks.prisma.user.findMany.mockResolvedValue([{ tenantId: 'tenant-usuario' }])
    mocks.prisma.integration.findMany.mockResolvedValue([
      { tenantId: 'tenant-usuario', credenciales: { bot_token: 'token-usuario' } },
    ])
    mocks.prisma.integration.findFirst.mockResolvedValue({
      credenciales: { bot_token: 'token-usuario' },
    })

    const ctx = await resolver.resolverContextoTelegram(CHAT)
    expect(ctx).toEqual({ tenantId: 'tenant-usuario', botToken: 'token-usuario' })
  })

  it('DOS tenants vinculados sin historial → NO se resuelve (null)', async () => {
    mocks.prisma.integration.findMany.mockResolvedValue([
      { tenantId: 'tenant-a', credenciales: { admin_chat_id: CHAT, bot_token: 'tk-a' } },
      { tenantId: 'tenant-b', credenciales: { admin_chat_id: CHAT, bot_token: 'tk-b' } },
    ])

    expect(await resolver.resolverContextoTelegram(CHAT)).toBeNull()
  })

  it('DOS tenants vinculados con historial en uno → desempata la conversación', async () => {
    mocks.prisma.integration.findMany.mockResolvedValue([
      { tenantId: 'tenant-a', credenciales: { admin_chat_id: CHAT, bot_token: 'tk-a' } },
      { tenantId: 'tenant-b', credenciales: { admin_chat_id: CHAT, bot_token: 'tk-b' } },
    ])
    mocks.prisma.conversation.findFirst.mockResolvedValue({ tenantId: 'tenant-b' })
    mocks.prisma.integration.findFirst.mockImplementation(({ where }: any) =>
      Promise.resolve(
        where.tenantId === 'tenant-b' ? { credenciales: { bot_token: 'tk-b' } } : null
      )
    )

    const ctx = await resolver.resolverContextoTelegram(CHAT)
    expect(ctx).toEqual({ tenantId: 'tenant-b', botToken: 'tk-b' })
  })

  it('sin vínculo pero con conversación previa → ese tenant', async () => {
    mocks.prisma.conversation.findFirst.mockResolvedValue({ tenantId: 'tenant-historial' })
    mocks.prisma.integration.findFirst.mockResolvedValue({
      credenciales: { bot_token: 'tk-historial' },
    })

    const ctx = await resolver.resolverContextoTelegram(CHAT)
    expect(ctx).toEqual({ tenantId: 'tenant-historial', botToken: 'tk-historial' })
  })

  it('sin vínculo ni historial y DOS bots en el sistema → NO se resuelve (null)', async () => {
    mocks.prisma.integration.findMany.mockResolvedValue([
      { tenantId: 'tenant-a', credenciales: { bot_token: 'tk-a' } },
      { tenantId: 'tenant-b', credenciales: { bot_token: 'tk-b' } },
    ])

    expect(await resolver.resolverContextoTelegram(CHAT)).toBeNull()
  })

  it('sin vínculo ni historial y UN solo bot en el sistema → ese (por eliminación)', async () => {
    mocks.prisma.integration.findMany.mockResolvedValue([
      { tenantId: 'tenant-unico', credenciales: { bot_token: 'tk-unico' } },
    ])
    mocks.prisma.integration.findFirst.mockResolvedValue({
      credenciales: { bot_token: 'tk-unico' },
    })

    const ctx = await resolver.resolverContextoTelegram(CHAT)
    expect(ctx).toEqual({ tenantId: 'tenant-unico', botToken: 'tk-unico' })
  })

  it('tenant vinculado pero sin bot propio → NO se resuelve (no hay cómo responder)', async () => {
    mocks.prisma.integration.findMany.mockResolvedValue([
      { tenantId: 'tenant-sin-bot', credenciales: { admin_chat_id: CHAT } },
    ])

    expect(await resolver.resolverContextoTelegram(CHAT)).toBeNull()
  })
})

describe('chatVinculadoSoloA — guardia de envío', () => {
  it('chat sin vínculos → permitido (cliente que escribe por primera vez)', async () => {
    expect(await resolver.chatVinculadoSoloA(CHAT, 'tenant-a')).toBe(true)
  })

  it('chat vinculado solo a ese tenant → permitido', async () => {
    mocks.prisma.integration.findMany.mockResolvedValue([
      { tenantId: 'tenant-a', credenciales: { admin_chat_id: CHAT, bot_token: 'tk' } },
    ])
    expect(await resolver.chatVinculadoSoloA(CHAT, 'tenant-a')).toBe(true)
  })

  it('chat vinculado a OTRO tenant → bloqueado', async () => {
    mocks.prisma.integration.findMany.mockResolvedValue([
      { tenantId: 'tenant-ajeno', credenciales: { admin_chat_id: CHAT, bot_token: 'tk' } },
    ])
    expect(await resolver.chatVinculadoSoloA(CHAT, 'tenant-a')).toBe(false)
  })

  it('chat vinculado a DOS tenants → bloqueado para ambos', async () => {
    mocks.prisma.integration.findMany.mockResolvedValue([
      { tenantId: 'tenant-a', credenciales: { admin_chat_id: CHAT, bot_token: 'tk' } },
      { tenantId: 'tenant-b', credenciales: { admin_chat_id: CHAT, bot_token: 'tk' } },
    ])
    expect(await resolver.chatVinculadoSoloA(CHAT, 'tenant-a')).toBe(false)
    expect(await resolver.chatVinculadoSoloA(CHAT, 'tenant-b')).toBe(false)
  })
})

describe('desvincularChatDeOtrosTenants — un chat = un tenant', () => {
  it('limpia integración, canal y usuario de otros tenants sin tocar el que se conserva', async () => {
    mocks.prisma.integration.findMany.mockResolvedValue([
      { id: 'int-mio', tenantId: 'tenant-mio', credenciales: { admin_chat_id: CHAT, bot_token: 'tk' } },
      { id: 'int-ajeno', tenantId: 'tenant-ajeno', credenciales: { admin_chat_id: CHAT, bot_token: 'tk2' } },
    ])
    mocks.prisma.channel.findMany.mockResolvedValue([
      { id: 'ch-ajeno', tenantId: 'tenant-ajeno', config: { adminChatId: CHAT, botToken: 'enc(x)' } },
    ])
    mocks.prisma.user.findMany.mockResolvedValue([
      { id: 'user-ajeno', tenantId: 'tenant-ajeno', metadata: { telegram_chat_id: CHAT, telegram: { chat_id: CHAT } } },
    ])

    await resolver.desvincularChatDeOtrosTenants(CHAT, 'tenant-mio')

    expect(mocks.prisma.integration.update).toHaveBeenCalledTimes(1)
    expect(mocks.prisma.integration.update).toHaveBeenCalledWith({
      where: { id: 'int-ajeno' },
      data: { credenciales: { admin_chat_id: null, bot_token: 'tk2' } },
    })

    expect(mocks.prisma.channel.update).toHaveBeenCalledTimes(1)
    expect(mocks.prisma.channel.update).toHaveBeenCalledWith({
      where: { id: 'ch-ajeno' },
      data: { config: { adminChatId: null, botToken: 'enc(x)' } },
    })

    expect(mocks.prisma.user.update).toHaveBeenCalledTimes(1)
    expect(mocks.prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-ajeno' },
      data: { metadata: { telegram: { chat_id: null, linkedAt: null } } },
    })
  })
})

describe('vincularChatComoAdmin — /start <tenantId>', () => {
  it('escribe el admin_chat_id en el tenant indicado y desvincula a los demás', async () => {
    mocks.prisma.integration.findFirst.mockResolvedValue({
      id: 'int-mio',
      credenciales: { bot_token: 'tk-mio' },
    })
    mocks.prisma.integration.findMany.mockResolvedValue([
      { id: 'int-ajeno', tenantId: 'tenant-ajeno', credenciales: { admin_chat_id: CHAT, bot_token: 'tk2' } },
    ])

    const ok = await resolver.vincularChatComoAdmin(CHAT, 'tenant-mio')

    expect(ok).toBe(true)
    const mio = mocks.prisma.integration.update.mock.calls.find(
      ([args]: any[]) => args.where.id === 'int-mio'
    )![0]
    expect(mio.data.credenciales.admin_chat_id).toBe(CHAT)
    // Se sella la fecha para que el panel pueda decir «vinculado desde…».
    expect(Number.isNaN(Date.parse(mio.data.credenciales.admin_chat_vinculado_en))).toBe(false)
    // El ajeno quedó limpio antes de escribir el nuevo vínculo.
    expect(mocks.prisma.integration.update).toHaveBeenCalledWith({
      where: { id: 'int-ajeno' },
      data: { credenciales: { admin_chat_id: null, bot_token: 'tk2' } },
    })
  })

  it('en el canal moderno guarda adminChatId y su marca de fecha', async () => {
    mocks.prisma.channel.findFirst.mockResolvedValue({
      id: 'ch-mio',
      config: { botToken: 'enc(tk)', botUsername: 'bot_canal' },
    })

    expect(await resolver.vincularChatComoAdmin(CHAT, 'tenant-mio')).toBe(true)

    const llamada = mocks.prisma.channel.update.mock.calls[0][0]
    expect(llamada.where.id).toBe('ch-mio')
    expect(llamada.data.config.adminChatId).toBe(CHAT)
    expect(Number.isNaN(Date.parse(llamada.data.config.adminChatVinculadoEn))).toBe(false)
    // No se toca el token del bot.
    expect(llamada.data.config.botToken).toBe('enc(tk)')
  })

  it('al desvincular un chat de otro tenant también borra su marca de fecha', async () => {
    mocks.prisma.integration.findMany.mockResolvedValue([
      {
        id: 'int-ajeno',
        tenantId: 'tenant-ajeno',
        credenciales: {
          admin_chat_id: CHAT,
          admin_chat_vinculado_en: '2026-10-03T09:15:00.000Z',
          bot_token: 'tk2',
        },
      },
    ])

    await resolver.desvincularChatDeOtrosTenants(CHAT, 'tenant-mio')

    const creds = mocks.prisma.integration.update.mock.calls[0][0].data.credenciales
    expect(creds.admin_chat_id).toBeNull()
    expect(creds.admin_chat_vinculado_en).toBeUndefined()
    expect(creds.bot_token).toBe('tk2')
  })

  it('si el tenant no tiene integración ni canal → false (no se vincula a otro)', async () => {
    mocks.prisma.integration.findFirst.mockResolvedValue(null)
    mocks.prisma.channel.findFirst.mockResolvedValue(null)

    expect(await resolver.vincularChatComoAdmin(CHAT, 'tenant-sin-telegram')).toBe(false)
    expect(mocks.prisma.integration.update).not.toHaveBeenCalled()
    expect(mocks.prisma.channel.update).not.toHaveBeenCalled()
  })
})
