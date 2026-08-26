// @vitest-environment node
//
// Tests del helper de aviso al desarrollador por Telegram para acciones
// sensibles (conectar/desconectar integraciones, reiniciar métricas, etc.).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  sendTelegramMessage: vi.fn(),
}))

vi.mock('@/lib/telegram', () => ({ sendTelegramMessage: mocks.sendTelegramMessage }))

import { notifyDeveloperSensitiveAction } from '@/lib/telegram/developer-notify'

const ORIG_ADMIN = process.env.TELEGRAM_ADMIN_CHAT_ID

describe('notifyDeveloperSensitiveAction', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.sendTelegramMessage.mockResolvedValue({ success: true })
  })

  afterEach(() => {
    if (ORIG_ADMIN === undefined) delete process.env.TELEGRAM_ADMIN_CHAT_ID
    else process.env.TELEGRAM_ADMIN_CHAT_ID = ORIG_ADMIN
  })

  it('envía el aviso al desarrollador con quién lo hizo y el detalle', async () => {
    process.env.TELEGRAM_ADMIN_CHAT_ID = '646107192'
    await notifyDeveloperSensitiveAction({
      title: '🔌 Integración conectada/actualizada',
      accion: 'Conectada/actualizada integración stripe',
      detalle: 'Integración "Stripe" (tipo stripe)',
      quien: 'Bruno Hess',
      userId: 'u_bruno',
      extra: 'TenantId: t_1',
    })

    expect(mocks.sendTelegramMessage).toHaveBeenCalledTimes(1)
    const [chatId, text] = mocks.sendTelegramMessage.mock.calls[0]
    expect(chatId).toBe('646107192')
    expect(text).toContain('stripe')
    expect(text).toContain('Bruno Hess')
    expect(text).toContain('u_bruno')
    expect(text).toContain('t_1')
  })

  it('no lanza si TELEGRAM_ADMIN_CHAT_ID no está configurado', async () => {
    delete process.env.TELEGRAM_ADMIN_CHAT_ID
    await expect(
      notifyDeveloperSensitiveAction({
        title: 'Test',
        accion: 'x',
        detalle: 'd',
        quien: 'q',
      })
    ).resolves.toBeUndefined()
    expect(mocks.sendTelegramMessage).not.toHaveBeenCalled()
  })

  it('no lanza si el envío falla (fire-and-forget)', async () => {
    process.env.TELEGRAM_ADMIN_CHAT_ID = '646107192'
    mocks.sendTelegramMessage.mockResolvedValue({ success: false, error: 'telegr down' })
    await expect(
      notifyDeveloperSensitiveAction({
        title: 'Test',
        accion: 'x',
        detalle: 'd',
        quien: 'q',
      })
    ).resolves.toBeUndefined()
  })

  it('no lanza si sendTelegramMessage lanza una excepción', async () => {
    process.env.TELEGRAM_ADMIN_CHAT_ID = '646107192'
    mocks.sendTelegramMessage.mockRejectedValue(new Error('boom'))
    await expect(
      notifyDeveloperSensitiveAction({
        title: 'Test',
        accion: 'x',
        detalle: 'd',
        quien: 'q',
      })
    ).resolves.toBeUndefined()
  })
})