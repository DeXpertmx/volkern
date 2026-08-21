import { describe, expect, it, vi, afterEach } from 'vitest'

describe('sendTelegramMessage con botones inline', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('incluye reply_markup en el body cuando se pasa extra', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const { sendTelegramMessage } = await import('@/lib/telegram')
    const keyboard = {
      inline_keyboard: [
        [
          { text: '✅ Completar', callback_data: 'task:complete:t1' },
          { text: '📅 Reprogramar', callback_data: 'task:resched:t1' },
        ],
      ],
    }

    await sendTelegramMessage('123456789', '🚨 Tarea vencida', 'BOT:TOKEN', {
      reply_markup: keyboard,
    })

    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toContain('BOT:TOKEN/sendMessage')
    const body = JSON.parse((init as any).body)
    expect(body.chat_id).toBe('123456789')
    expect(body.parse_mode).toBe('HTML')
    expect(body.reply_markup).toEqual(keyboard)
  })

  it('omite reply_markup cuando no se pasa extra', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const { sendTelegramMessage } = await import('@/lib/telegram')
    await sendTelegramMessage('123456789', 'Hola', 'BOT:TOKEN')

    const [, init] = fetchMock.mock.calls[0]
    const body = JSON.parse((init as any).body)
    expect(body.reply_markup).toBeUndefined()
  })

  it('usa el token del tenant en vez del de entorno', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const { sendTelegramMessage } = await import('@/lib/telegram')
    await sendTelegramMessage('123', 'msg', 'TENANT:BOT', {
      reply_markup: { inline_keyboard: [[{ text: 'X', callback_data: 'qr:x' }]] },
    })

    const [url] = fetchMock.mock.calls[0]
    expect(String(url)).toContain('TENANT:BOT/sendMessage')
  })
})
