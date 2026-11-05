/**
 * Guardián: los teclados inline de las notificaciones de Telegram deben llegar
 * a la API envueltos en `reply_markup`.
 *
 * `TelegramService.sendMessage` solo adjunta el teclado cuando el 4º argumento
 * trae `reply_markup`. `NotificationService.sendTelegram` construía el
 * `inline_keyboard` y lo pasaba suelto, así que el morning briefing y los
 * botones de acción de tarea salían **sin teclado** (Telegram recibía el
 * mensaje, pero sin botones).
 */
// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const prisma = {
    integration: { findFirst: vi.fn(), findMany: vi.fn() },
    channel: { findFirst: vi.fn(), findMany: vi.fn() },
    user: { findMany: vi.fn() },
    conversation: { findFirst: vi.fn() },
  }
  return {
    prisma,
    sendTelegramMessage: vi.fn(),
    chatVinculadoSoloA: vi.fn(),
  }
})

vi.mock('@/lib/db', () => ({ prisma: mocks.prisma, default: mocks.prisma }))
// Módulo real (loadTelegramCredentials) capturando solo los envíos.
vi.mock('@/lib/telegram', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/telegram')>()
  return { ...actual, sendTelegramMessage: mocks.sendTelegramMessage }
})
vi.mock('@/lib/telegram/context-resolver', () => ({
  chatVinculadoSoloA: (...args: unknown[]) => mocks.chatVinculadoSoloA(...args),
}))

const { notificationService } = await import('../lib/skills/notification-layer')

beforeEach(() => {
  vi.clearAllMocks()
  mocks.prisma.integration.findFirst.mockResolvedValue({
    credenciales: { bot_token: 'bot-del-tenant', admin_chat_id: '111' },
  })
  mocks.prisma.channel.findFirst.mockResolvedValue(null)
  mocks.prisma.integration.findMany.mockResolvedValue([])
  mocks.prisma.channel.findMany.mockResolvedValue([])
  mocks.prisma.user.findMany.mockResolvedValue([])
  mocks.prisma.conversation.findFirst.mockResolvedValue(null)
  mocks.sendTelegramMessage.mockResolvedValue({ success: true })
  mocks.chatVinculadoSoloA.mockResolvedValue(true)
})

const context = { tenantId: 'tenant-a' } as any

describe('NotificationService.sendTelegram — teclado inline', () => {
  it('envía el inline_keyboard bajo reply_markup (botones de acción de tarea)', async () => {
    const inlineKeyboard = [
      [
        { text: '✅ Completar', callback_data: 'task:complete:t1' },
        { text: '📅 Reprogramar', callback_data: 'task:resched:t1' },
      ],
    ]

    await (notificationService as any).sendTelegram(
      { type: 'external' },
      { body: 'Tareas de hoy', inlineKeyboard },
      context
    )

    expect(mocks.sendTelegramMessage).toHaveBeenCalledTimes(1)
    const [chatId, body, token, extra] = mocks.sendTelegramMessage.mock.calls[0]
    expect(chatId).toBe('111')
    expect(body).toBe('Tareas de hoy')
    expect(token).toBe('bot-del-tenant')
    expect(extra).toEqual({ reply_markup: { inline_keyboard: inlineKeyboard } })
  })

  it('convierte `actions` en botones URL dentro de reply_markup', async () => {
    await (notificationService as any).sendTelegram(
      { type: 'external' },
      {
        body: 'Ver catálogo',
        actions: [{ label: '🛒 Ver en Catálogo', url: 'https://volkern.app/dashboard/catalogo' }],
      },
      context
    )

    const extra = mocks.sendTelegramMessage.mock.calls[0][3]
    expect(extra).toEqual({
      reply_markup: {
        inline_keyboard: [
          [{ text: '🛒 Ver en Catálogo', url: 'https://volkern.app/dashboard/catalogo' }],
        ],
      },
    })
  })

  it('sin teclado no envía reply_markup (no rompe el mensaje de texto)', async () => {
    await (notificationService as any).sendTelegram(
      { type: 'external' },
      { body: 'Aviso simple' },
      context
    )

    expect(mocks.sendTelegramMessage.mock.calls[0][3]).toBeUndefined()
  })
})
