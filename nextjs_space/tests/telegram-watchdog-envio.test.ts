// @vitest-environment node
//
// TelegramWatchdog — avisos de seguridad (RRHH/nómina) y de lead nuevo.
//
// Regresión: el watchdog llamaba a `loadTelegramCredentials()` **sin** tenant,
// comprobaba `creds.chatId` (campo que no existe) y llamaba a
// `sendTelegramMessage({ tenantId, text, parseMode })` con un objeto donde va el
// `chatId`. Resultado: no enviaba nunca; y de haber enviado, habría salido por
// el bot del sistema con `parse_mode: 'HTML'` y las marcas Markdown literales.
import { describe, it, expect, beforeEach, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  loadTelegramCredentials: vi.fn(),
  chatVinculadoSoloA: vi.fn(),
  sendBotMessage: vi.fn(),
  prisma: {
    employee: { findFirst: vi.fn() },
    tenant: { findUnique: vi.fn() },
    systemAlert: { create: vi.fn() },
  },
}))

vi.mock('@/lib/db', () => ({ prisma: mocks.prisma }))
vi.mock('@/lib/telegram', () => ({
  loadTelegramCredentials: mocks.loadTelegramCredentials,
}))
vi.mock('@/lib/telegram/context-resolver', () => ({
  chatVinculadoSoloA: mocks.chatVinculadoSoloA,
}))
vi.mock('@/lib/telegram/quick-replies', () => ({
  sendBotMessage: mocks.sendBotMessage,
}))

const { TelegramWatchdog } = await import('@/lib/security/telegram-watchdog')

const brief = {
  event: 'OFFBOARDING_START' as const,
  employeeName: 'Marta Ruiz',
  riskSummary: 'Acceso a nómina tras la baja',
  roadmapLink: 'https://volkern.app/rrhh/12',
  metadata: { attendancePercent: 84.2, operatorNote: 'Revisado por dirección' },
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.prisma.employee.findFirst.mockResolvedValue({ fullName: 'Bruno Hess' })
  mocks.prisma.tenant.findUnique.mockResolvedValue({
    nombre: 'Hotel Prueba',
    configuracion: {},
    slug: 'hotel-prueba',
  })
  mocks.prisma.systemAlert.create.mockResolvedValue({ id: 'alert_1' })
  mocks.loadTelegramCredentials.mockResolvedValue({
    bot_token: 'bot-del-tenant',
    admin_chat_id: '555000111',
  })
  mocks.chatVinculadoSoloA.mockResolvedValue(true)
  mocks.sendBotMessage.mockResolvedValue({ success: true })
})

describe('TelegramWatchdog.sendSecurityBrief', () => {
  it('envía por el bot y al chat del propio tenant, en Markdown', async () => {
    await TelegramWatchdog.sendSecurityBrief('t_hotel', brief)

    // Credenciales pedidas CON tenant: nunca las del entorno.
    expect(mocks.loadTelegramCredentials).toHaveBeenCalledWith('t_hotel')
    expect(mocks.chatVinculadoSoloA).toHaveBeenCalledWith('555000111', 't_hotel')

    expect(mocks.sendBotMessage).toHaveBeenCalledTimes(1)
    const [chatId, texto, token] = mocks.sendBotMessage.mock.calls[0]
    expect(chatId).toBe('555000111')
    expect(token).toBe('bot-del-tenant')
    expect(texto).toContain('VOLKERN SECURITY BRIEFING')
    expect(texto).toContain('Marta Ruiz')
    expect(texto).toContain('*Asistencia:* 84.2%')
    expect(texto).toContain('Revisado por dirección')
    expect(texto).toContain('https://volkern.app/rrhh/12')

    // Traza en el sistema.
    expect(mocks.prisma.systemAlert.create).toHaveBeenCalledTimes(1)
    expect(mocks.prisma.systemAlert.create.mock.calls[0][0].data.message).toContain(
      'BAJA DE EMPLEADO CRÍTICO'
    )
  })

  it('sin bot propio no envía nada ni deja rastro de éxito', async () => {
    mocks.loadTelegramCredentials.mockResolvedValue({
      bot_token: null,
      admin_chat_id: null,
    })

    await TelegramWatchdog.sendSecurityBrief('t_sin_bot', brief)

    expect(mocks.sendBotMessage).not.toHaveBeenCalled()
    expect(mocks.prisma.systemAlert.create).not.toHaveBeenCalled()
  })

  it('con bot pero sin chat de administración no envía', async () => {
    mocks.loadTelegramCredentials.mockResolvedValue({
      bot_token: 'bot-del-tenant',
      admin_chat_id: null,
    })

    await TelegramWatchdog.sendSecurityBrief('t_hotel', brief)

    expect(mocks.sendBotMessage).not.toHaveBeenCalled()
  })

  it('si el chat está vinculado a otro tenant no envía (un chat, un tenant)', async () => {
    mocks.chatVinculadoSoloA.mockResolvedValue(false)

    await TelegramWatchdog.sendSecurityBrief('t_hotel', brief)

    expect(mocks.sendBotMessage).not.toHaveBeenCalled()
    expect(mocks.prisma.systemAlert.create).not.toHaveBeenCalled()
  })

  it('respeta el interruptor del tenant', async () => {
    mocks.prisma.tenant.findUnique.mockResolvedValue({
      nombre: 'Hotel Prueba',
      configuracion: { notifications: { disableTelegramWatchdog: true } },
      slug: 'hotel-prueba',
    })

    await TelegramWatchdog.sendSecurityBrief('t_hotel', brief)

    expect(mocks.loadTelegramCredentials).not.toHaveBeenCalled()
    expect(mocks.sendBotMessage).not.toHaveBeenCalled()
  })

  it('si Telegram rechaza el envío no se registra como enviado ni se propaga', async () => {
    mocks.sendBotMessage.mockResolvedValue({ success: false, error: 'chat not found' })

    await expect(
      TelegramWatchdog.sendSecurityBrief('t_hotel', brief)
    ).resolves.toBeUndefined()

    expect(mocks.prisma.systemAlert.create).not.toHaveBeenCalled()
  })
})

describe('TelegramWatchdog.sendLeadAlert', () => {
  const lead = { name: 'Ana', email: 'ana@ejemplo.com', source: 'web' }

  it('avisa al chat del tenant con su bot', async () => {
    await TelegramWatchdog.sendLeadAlert('t_hotel', lead)

    expect(mocks.loadTelegramCredentials).toHaveBeenCalledWith('t_hotel')
    expect(mocks.sendBotMessage).toHaveBeenCalledTimes(1)
    const [chatId, texto, token] = mocks.sendBotMessage.mock.calls[0]
    expect(chatId).toBe('555000111')
    expect(token).toBe('bot-del-tenant')
    expect(texto).toContain('NUEVO LEAD CAPTURADO')
    expect(texto).toContain('ana@ejemplo.com')
  })

  it('sin Telegram propio no envía y no revienta', async () => {
    mocks.loadTelegramCredentials.mockResolvedValue({
      bot_token: null,
      admin_chat_id: null,
    })

    await TelegramWatchdog.sendLeadAlert('t_sin_bot', lead)

    expect(mocks.sendBotMessage).not.toHaveBeenCalled()
  })

  it('un error de envío se registra y no propaga', async () => {
    mocks.sendBotMessage.mockResolvedValue({ success: false, error: 'blocked' })

    await expect(TelegramWatchdog.sendLeadAlert('t_hotel', lead)).resolves.toBeUndefined()
  })
})
