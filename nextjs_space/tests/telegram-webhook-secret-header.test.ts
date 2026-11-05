/**
 * Cableado del `secret_token` en el webhook de Telegram.
 *
 * Cuando la cabecera identifica al bot, el tenant deja de resolverse por
 * vínculos/historial: es el del bot que entregó el update. Sin cabecera se
 * mantiene la resolución anterior (bots aún sin re-registrar); con cabecera
 * desconocida no se procesa nada.
 *
 * La derivación y validación real del secret se prueba en
 * `telegram-webhook-secret.test.ts`; aquí solo se comprueba el cableado.
 */
// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  verificar: vi.fn(),
  requiere: vi.fn(),
  resolverContexto: vi.fn(),
  tokenBotDelTenant: vi.fn(),
  vinculosDelChat: vi.fn(),
  tenantsConBotPropio: vi.fn(),
  vincularChatComoAdmin: vi.fn(),
  desvincularChatDeOtrosTenants: vi.fn(),
  chatVinculadoSoloA: vi.fn(),
  isChatRateLimited: vi.fn(),
  processMessage: vi.fn(),
  sendBotMessage: vi.fn(),
  clearReplyMarkup: vi.fn(),
  ipDeRequest: vi.fn(),
  ipBloqueada: vi.fn(),
  registrarFalloSecret: vi.fn(),
}))

vi.mock('@/lib/db', () => {
  const prisma = new Proxy(
    {},
    {
      get: () => ({
        findFirst: vi.fn(),
        findMany: vi.fn().mockResolvedValue([]),
        findUnique: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
        create: vi.fn(),
      }),
    }
  )
  return { prisma, default: prisma }
})

vi.mock('@/lib/telegram/webhook-secret', () => ({
  TELEGRAM_SECRET_HEADER: 'x-telegram-bot-api-secret-token',
  requiereSecret: (...args: unknown[]) => mocks.requiere(...args),
  verificarCabeceraSecret: (...args: unknown[]) => mocks.verificar(...args),
}))

vi.mock('@/lib/telegram/context-resolver', () => ({
  resolverContextoTelegram: (...args: unknown[]) => mocks.resolverContexto(...args),
  tokenBotDelTenant: (...args: unknown[]) => mocks.tokenBotDelTenant(...args),
  vinculosDelChat: (...args: unknown[]) => mocks.vinculosDelChat(...args),
  tenantsConBotPropio: (...args: unknown[]) => mocks.tenantsConBotPropio(...args),
  vincularChatComoAdmin: (...args: unknown[]) => mocks.vincularChatComoAdmin(...args),
  desvincularChatDeOtrosTenants: (...args: unknown[]) => mocks.desvincularChatDeOtrosTenants(...args),
  chatVinculadoSoloA: (...args: unknown[]) => mocks.chatVinculadoSoloA(...args),
}))

vi.mock('@/lib/telegram/chat-rate-limit', () => ({
  isChatRateLimited: (...args: unknown[]) => mocks.isChatRateLimited(...args),
}))

vi.mock('@/lib/telegram/webhook-secret-rate-limit', () => ({
  ipDeRequest: (...args: unknown[]) => mocks.ipDeRequest(...args),
  ipBloqueada: (...args: unknown[]) => mocks.ipBloqueada(...args),
  registrarFalloSecret: (...args: unknown[]) => mocks.registrarFalloSecret(...args),
  segundosBloqueo: () => 600,
}))

vi.mock('@/lib/telegram/quick-replies', () => ({
  parseQuickReplyCallback: (data: string | undefined | null) =>
    data && data.startsWith('qr:') ? data.slice(3) : null,
  buildQuickReplyMarkup: vi.fn(() => ({ inline_keyboard: [] })),
  clearReplyMarkup: (...args: unknown[]) => mocks.clearReplyMarkup(...args),
  sendBotMessage: (...args: unknown[]) => mocks.sendBotMessage(...args),
}))

vi.mock('@/lib/chat/chatbot-service', () => ({
  processMessage: (...args: unknown[]) => mocks.processMessage(...args),
}))

vi.mock('@/lib/s3', () => ({ getDownloadUrl: vi.fn() }))
vi.mock('@/app/api/erp/expenses/scan/route', () => ({ callVision: vi.fn() }))
vi.mock('@/lib/finance/expense-inbox', () => ({ createExpenseInboxDocument: vi.fn() }))

import { POST } from '@/app/api/webhooks/telegram/route'

const HEADER = 'x-telegram-bot-api-secret-token'

const update = (updateId: number, texto = 'hola') => ({
  update_id: updateId,
  message: {
    message_id: updateId,
    date: 0,
    chat: { id: 555, type: 'private' },
    from: { id: 555, first_name: 'Ana' },
    text: texto,
  },
})

const post = (body: unknown, headers: Record<string, string> = {}) =>
  POST(
    new Request('http://test.local/api/webhooks/telegram', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
    })
  )

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requiere.mockReturnValue(false)
  mocks.isChatRateLimited.mockResolvedValue(false)
  mocks.processMessage.mockResolvedValue({ success: true, response: 'respuesta ok' })
  mocks.sendBotMessage.mockResolvedValue({ success: true })
  mocks.resolverContexto.mockResolvedValue(null)
  mocks.ipDeRequest.mockReturnValue('203.0.113.9')
  mocks.ipBloqueada.mockResolvedValue(false)
  mocks.registrarFalloSecret.mockResolvedValue({ fallos: 1, bloqueada: false })
})

describe('POST /api/webhooks/telegram — cabecera secret', () => {
  it('cabecera que no es de ningún bot → 401 y no se procesa el mensaje', async () => {
    mocks.verificar.mockResolvedValue({ estado: 'invalida' })

    const res = await post(update(1), { [HEADER]: 'falsa' })

    expect(res.status).toBe(401)
    expect(mocks.processMessage).not.toHaveBeenCalled()
    expect(mocks.resolverContexto).not.toHaveBeenCalled()
  })

  it('cabecera válida → usa el tenant del bot y no pasa por la resolución por vínculos', async () => {
    mocks.verificar.mockResolvedValue({
      estado: 'valida',
      tenantId: 'tenant-del-bot',
      botToken: 'BOT:TOKEN',
    })

    const res = await post(update(2), { [HEADER]: 'secret-valido' })

    expect(res.status).toBe(200)
    expect(mocks.resolverContexto).not.toHaveBeenCalled()
    expect(mocks.processMessage).toHaveBeenCalledTimes(1)
    expect(mocks.processMessage.mock.calls[0][0]).toMatchObject({
      tenantId: 'tenant-del-bot',
      channel: 'telegram',
      message: 'hola',
    })
    // La respuesta sale por el bot identificado por el secret.
    expect(mocks.sendBotMessage).toHaveBeenCalledWith('555', 'respuesta ok', 'BOT:TOKEN', undefined)
  })

  it('sin cabecera y con exigencia activa → 401 (se pasa `requerir` al verificador)', async () => {
    mocks.requiere.mockReturnValue(true)
    mocks.verificar.mockResolvedValue({ estado: 'invalida' })

    const res = await post(update(3))

    expect(res.status).toBe(401)
    expect(mocks.verificar).toHaveBeenCalledWith(null, { requerir: true })
    expect(mocks.processMessage).not.toHaveBeenCalled()
  })

  it('sin cabecera y sin exigirla → se mantiene la resolución por vínculos', async () => {
    mocks.verificar.mockResolvedValue({ estado: 'sin_cabecera' })

    const res = await post(update(4))

    expect(res.status).toBe(200)
    expect(mocks.verificar).toHaveBeenCalledWith(null, { requerir: false })
    expect(mocks.resolverContexto).toHaveBeenCalledWith('555')
    // Sin contexto resuelto el mensaje se ignora (no contesta con datos de otro tenant).
    expect(mocks.processMessage).not.toHaveBeenCalled()
    // Sin cabecera no hay nada que verificar ni cuota que consumir.
    expect(mocks.ipBloqueada).not.toHaveBeenCalled()
    expect(mocks.registrarFalloSecret).not.toHaveBeenCalled()
  })
})

describe('POST /api/webhooks/telegram — cortafuegos por IP', () => {
  it('IP bloqueada → 429 sin verificar el secret (no se toca la base)', async () => {
    mocks.ipBloqueada.mockResolvedValue(true)

    const res = await post(update(10), { [HEADER]: 'secret-cualquiera' })

    expect(res.status).toBe(429)
    expect(res.headers.get('Retry-After')).toBe('600')
    expect(mocks.ipBloqueada).toHaveBeenCalledWith('203.0.113.9')
    // Lo importante: la verificación (que escanea bots en la base) no se ejecuta.
    expect(mocks.verificar).not.toHaveBeenCalled()
    expect(mocks.processMessage).not.toHaveBeenCalled()
  })

  it('secret inválido → consume un fallo de la IP', async () => {
    mocks.verificar.mockResolvedValue({ estado: 'invalida' })

    const res = await post(update(11), { [HEADER]: 'falsa' })

    expect(res.status).toBe(401)
    expect(mocks.registrarFalloSecret).toHaveBeenCalledWith('203.0.113.9')
  })

  it('update válido → no consume cuota de fallos', async () => {
    mocks.verificar.mockResolvedValue({
      estado: 'valida',
      tenantId: 'tenant-del-bot',
      botToken: 'BOT:TOKEN',
    })

    const res = await post(update(12), { [HEADER]: 'secret-valido' })

    expect(res.status).toBe(200)
    expect(mocks.registrarFalloSecret).not.toHaveBeenCalled()
  })
})
