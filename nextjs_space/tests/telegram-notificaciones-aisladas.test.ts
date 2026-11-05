/**
 * Aislamiento de notificaciones por tenant en Telegram.
 *
 * Regresión de la fuga: `loadTelegramCredentials(tenantId)` caía en
 * `TELEGRAM_ADMIN_CHAT_ID` / `TELEGRAM_BOT_TOKEN` del entorno para cualquier
 * tenant sin integración propia, con lo que los avisos de otros tenants
 * llegaban al chat personal y salían por el bot del sistema.
 *
 * Ver `documentacion_tecnica/TELEGRAM_ARQUITECTURA.md` §1.
 */
// @vitest-environment node
import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const prisma = {
    integration: { findFirst: vi.fn(), findMany: vi.fn() },
    channel: { findFirst: vi.fn(), findMany: vi.fn() },
    user: { findMany: vi.fn() },
  }
  return {
    prisma,
    sendTelegramMessage: vi.fn(),
    chatVinculadoSoloA: vi.fn(),
  }
})

vi.mock('@/lib/db', () => ({ prisma: mocks.prisma, default: mocks.prisma }))
// Módulo real (para probar loadTelegramCredentials) pero capturando los envíos.
vi.mock('@/lib/telegram', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/telegram')>()
  return { ...actual, sendTelegramMessage: mocks.sendTelegramMessage }
})
vi.mock('@/lib/telegram/context-resolver', () => ({
  chatVinculadoSoloA: (...args: unknown[]) => mocks.chatVinculadoSoloA(...args),
}))

const { loadTelegramCredentials } = await import('../lib/telegram')
const { notificationService } = await import('../lib/skills/notification-layer')

const ENV_ADMIN = process.env.TELEGRAM_ADMIN_CHAT_ID
const ENV_BOT = process.env.TELEGRAM_BOT_TOKEN

beforeEach(() => {
  vi.clearAllMocks()
  process.env.TELEGRAM_ADMIN_CHAT_ID = 'chat-del-entorno'
  process.env.TELEGRAM_BOT_TOKEN = 'token-del-entorno'
  mocks.prisma.integration.findFirst.mockResolvedValue(null)
  mocks.prisma.channel.findFirst.mockResolvedValue(null)
  mocks.prisma.integration.findMany.mockResolvedValue([])
  mocks.prisma.channel.findMany.mockResolvedValue([])
  mocks.sendTelegramMessage.mockResolvedValue({ success: true })
  mocks.chatVinculadoSoloA.mockResolvedValue(true)
})

afterAll(() => {
  if (ENV_ADMIN === undefined) delete process.env.TELEGRAM_ADMIN_CHAT_ID
  else process.env.TELEGRAM_ADMIN_CHAT_ID = ENV_ADMIN
  if (ENV_BOT === undefined) delete process.env.TELEGRAM_BOT_TOKEN
  else process.env.TELEGRAM_BOT_TOKEN = ENV_BOT
})

describe('loadTelegramCredentials — nunca el entorno para un tenant', () => {
  it('tenant sin integración ni canal → nulls, aunque el entorno tenga chat y bot', async () => {
    const creds = await loadTelegramCredentials('tenant-sin-telegram')
    expect(creds).toEqual({ bot_token: null, admin_chat_id: null })
  })

  it('tenant con integración propia → sus credenciales, no las del entorno', async () => {
    mocks.prisma.integration.findFirst.mockResolvedValue({
      credenciales: { bot_token: 'bot-del-tenant', admin_chat_id: '111' },
    })

    const creds = await loadTelegramCredentials('tenant-con-telegram')
    expect(creds).toEqual({ bot_token: 'bot-del-tenant', admin_chat_id: '111' })
  })

  it('sin tenantId (uso de plataforma) → sigue devolviendo el entorno', async () => {
    const creds = await loadTelegramCredentials()
    expect(creds).toEqual({ bot_token: 'token-del-entorno', admin_chat_id: 'chat-del-entorno' })
  })
})

describe('NotificationService por Telegram — guardias de tenant', () => {
  const context = { tenantId: 'tenant-b' } as any
  const content = { body: 'Aviso de tenant-b' } as any

  const sendTelegram = (recipient: any) =>
    (notificationService as any).sendTelegram(recipient, content, context)

  it('tenant sin bot propio → failed y NO se envía nada (ni por el bot del sistema)', async () => {
    const result = await sendTelegram({ type: 'external' })

    expect(result.status).toBe('failed')
    expect(mocks.sendTelegramMessage).not.toHaveBeenCalled()
  })

  it('chat vinculado a OTRO tenant → failed y NO se envía', async () => {
    mocks.prisma.integration.findFirst.mockResolvedValue({
      credenciales: { bot_token: 'bot-del-tenant-b', admin_chat_id: '222' },
    })
    mocks.chatVinculadoSoloA.mockResolvedValue(false)

    const result = await sendTelegram({ type: 'external', telegramChatId: '999' })

    expect(result.status).toBe('failed')
    expect(mocks.sendTelegramMessage).not.toHaveBeenCalled()
  })

  it('con bot propio y chat vinculado solo a este tenant → se envía con SU bot', async () => {
    mocks.prisma.integration.findFirst.mockResolvedValue({
      credenciales: { bot_token: 'bot-del-tenant-b', admin_chat_id: '222' },
    })
    mocks.chatVinculadoSoloA.mockResolvedValue(true)

    const result = await sendTelegram({ type: 'external' })

    expect(mocks.sendTelegramMessage).toHaveBeenCalledWith(
      '222',
      'Aviso de tenant-b',
      'bot-del-tenant-b',
      undefined
    )
    expect(result.status).toBe('sent')
    // Nunca con el token del entorno.
    expect(mocks.sendTelegramMessage.mock.calls[0][2]).not.toBe('token-del-entorno')
  })

  it('maybeSendToTelegram no abre el envío si el tenant no tiene bot propio', async () => {
    await (notificationService as any).maybeSendToTelegram(
      { type: 'external', telegramChatId: '333' },
      content,
      context
    )

    expect(mocks.sendTelegramMessage).not.toHaveBeenCalled()
  })
})
