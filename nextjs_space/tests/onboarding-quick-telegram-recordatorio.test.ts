// @vitest-environment node
//
// Marcas del paso de Telegram en `/api/onboarding/quick`:
//  - `skip-telegram` anota que la empresa lo dejó para después (lo que alimenta
//    el recordatorio del panel).
//  - `dismiss-telegram-reminder` anota que se descartó.
//  - `GET` devuelve ambas para que el panel decida.
//
// Además vigila que el cuerpo se lea una sola vez: `req.json()` dos veces lanza
// y hacía que guardar módulos o perfil devolviera 500.
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  prisma: {
    user: { findUnique: vi.fn() },
    tenant: { findUnique: vi.fn(), update: vi.fn() },
    tenantFeature: { findMany: vi.fn(), createMany: vi.fn(), updateMany: vi.fn() },
    onboardingProgress: { findUnique: vi.fn(), upsert: vi.fn() },
    channel: { findFirst: vi.fn() },
    integration: { findFirst: vi.fn() },
  },
}))

vi.mock('next-auth', () => ({ getServerSession: mocks.getServerSession }))
vi.mock('@/lib/db', () => ({ default: mocks.prisma, prisma: mocks.prisma }))

import { GET, POST } from '@/app/api/onboarding/quick/route'

type Cuerpo = Record<string, unknown>

/** Request falsa cuyo `json()` se agota al primer uso, como la real. */
function peticion(cuerpo: Cuerpo) {
  let usado = false
  return {
    json: async () => {
      if (usado) throw new Error('Body is unusable: Body has already been read')
      usado = true
      return cuerpo
    },
  } as any
}

const CONFIG_ACTUAL = {
  perfil: 'crm_ventas',
  notifications: { disableTelegramWatchdog: false },
}

/** Marca ISO de hace N días, para no depender del reloj real del test. */
const haceDias = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString()

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getServerSession.mockResolvedValue({ user: { email: 'bruno@dimensionexpert.com' } })
  mocks.prisma.user.findUnique.mockResolvedValue({
    id: 'u1',
    tenantId: 't1',
    tenant: { configuracion: CONFIG_ACTUAL },
  })
  mocks.prisma.tenant.findUnique.mockResolvedValue({ configuracion: CONFIG_ACTUAL })
  mocks.prisma.tenant.update.mockResolvedValue({})
  mocks.prisma.tenantFeature.findMany.mockResolvedValue([])
  mocks.prisma.tenantFeature.createMany.mockResolvedValue({ count: 0 })
  mocks.prisma.tenantFeature.updateMany.mockResolvedValue({ count: 0 })
  mocks.prisma.onboardingProgress.findUnique.mockResolvedValue({ pasoActual: 4 })
  mocks.prisma.channel.findFirst.mockResolvedValue(null)
  mocks.prisma.integration.findFirst.mockResolvedValue(null)
})

describe('POST /api/onboarding/quick — skip-telegram', () => {
  it('anota la omisión sin borrar el resto de la configuración del tenant', async () => {
    const res = await POST(peticion({ step: 'skip-telegram' }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(typeof body.telegramOmitidoEn).toBe('string')

    const guardado = mocks.prisma.tenant.update.mock.calls[0][0].data.configuracion
    expect(guardado.perfil).toBe('crm_ventas')
    expect(guardado.notifications).toEqual({ disableTelegramWatchdog: false })
    expect(guardado.onboarding.telegramOmitidoEn).toBe(body.telegramOmitidoEn)
    // No se confunde con el descarte del recordatorio.
    expect(guardado.onboarding.telegramAvisoDescartadoEn).toBeUndefined()
  })

  it('no pisa la marca original si ya existía', async () => {
    const original = '2026-10-28T09:00:00.000Z'
    mocks.prisma.tenant.findUnique.mockResolvedValue({
      configuracion: { ...CONFIG_ACTUAL, onboarding: { telegramOmitidoEn: original } },
    })

    const body = await (await POST(peticion({ step: 'skip-telegram' }))).json()

    expect(body.telegramOmitidoEn).toBe(original)
    expect(
      mocks.prisma.tenant.update.mock.calls[0][0].data.configuracion.onboarding
        .telegramOmitidoEn
    ).toBe(original)
  })

  it('marcar el descarte no toca la marca de omisión', async () => {
    mocks.prisma.tenant.findUnique.mockResolvedValue({
      configuracion: { onboarding: { telegramOmitidoEn: '2026-10-28T09:00:00.000Z' } },
    })

    const body = await (await POST(peticion({ step: 'dismiss-telegram-reminder' }))).json()

    expect(typeof body.telegramAvisoDescartadoEn).toBe('string')
    const onboard = mocks.prisma.tenant.update.mock.calls[0][0].data.configuracion.onboarding
    expect(onboard.telegramOmitidoEn).toBe('2026-10-28T09:00:00.000Z')
    expect(onboard.telegramAvisoDescartadoEn).toBe(body.telegramAvisoDescartadoEn)
  })

  it('un descarte nuevo reemplaza al anterior (el descarte caduca)', async () => {
    const omisionOriginal = haceDias(50)
    const descarteViejo = haceDias(45)
    mocks.prisma.tenant.findUnique.mockResolvedValue({
      configuracion: {
        onboarding: {
          telegramOmitidoEn: omisionOriginal,
          telegramAvisoDescartadoEn: descarteViejo,
        },
      },
    })

    const body = await (await POST(peticion({ step: 'dismiss-telegram-reminder' }))).json()

    const onboard = mocks.prisma.tenant.update.mock.calls[0][0].data.configuracion.onboarding
    expect(onboard.telegramAvisoDescartadoEn).toBe(body.telegramAvisoDescartadoEn)
    // Si se respetara el descarte viejo, volver a cerrar el aviso no lo ocultaría.
    expect(onboard.telegramAvisoDescartadoEn).not.toBe(descarteViejo)
    // La omisión original sigue intacta.
    expect(onboard.telegramOmitidoEn).toBe(omisionOriginal)
  })

  it('silenciar anota su propia marca y no toca omisión ni descarte', async () => {
    mocks.prisma.tenant.findUnique.mockResolvedValue({
      configuracion: {
        onboarding: {
          telegramOmitidoEn: '2026-10-28T09:00:00.000Z',
          telegramAvisoDescartadoEn: '2026-10-30T09:00:00.000Z',
        },
      },
    })

    const body = await (await POST(peticion({ step: 'snooze-telegram-reminder' }))).json()

    expect(typeof body.telegramAvisoSilenciadoEn).toBe('string')
    const onboard = mocks.prisma.tenant.update.mock.calls[0][0].data.configuracion.onboarding
    expect(onboard.telegramAvisoSilenciadoEn).toBe(body.telegramAvisoSilenciadoEn)
    expect(onboard.telegramOmitidoEn).toBe('2026-10-28T09:00:00.000Z')
    expect(onboard.telegramAvisoDescartadoEn).toBe('2026-10-30T09:00:00.000Z')
  })

  it('volver a silenciarlo reinicia la semana', async () => {
    const viejo = haceDias(10)
    mocks.prisma.tenant.findUnique.mockResolvedValue({
      configuracion: { onboarding: { telegramAvisoSilenciadoEn: viejo } },
    })

    const body = await (await POST(peticion({ step: 'snooze-telegram-reminder' }))).json()

    const onboard = mocks.prisma.tenant.update.mock.calls[0][0].data.configuracion.onboarding
    expect(onboard.telegramAvisoSilenciadoEn).toBe(body.telegramAvisoSilenciadoEn)
    expect(onboard.telegramAvisoSilenciadoEn).not.toBe(viejo)
  })

  it('sin sesión no escribe nada', async () => {
    mocks.getServerSession.mockResolvedValue(null)

    const res = await POST(peticion({ step: 'skip-telegram' }))

    expect(res.status).toBe(401)
    expect(mocks.prisma.tenant.update).not.toHaveBeenCalled()
  })
})

describe('GET /api/onboarding/quick — estado del recordatorio', () => {
  const get = () => GET({ url: 'http://localhost/api/onboarding/quick' } as any)

  it('empresa que omitió Telegram y no lo ha conectado', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({
      id: 'u1',
      tenantId: 't1',
      tenant: {
        configuracion: { onboarding: { telegramOmitidoEn: '2026-10-30T08:00:00.000Z' } },
      },
    })

    const body = await (await get()).json()

    expect(body).toMatchObject({
      telegramConnected: false,
      telegramOmitido: true,
      telegramAvisoDescartado: false,
      telegramOmitidoEn: '2026-10-30T08:00:00.000Z',
    })
  })

  it('recordatorio descartado hace poco sigue oculto', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({
      id: 'u1',
      tenantId: 't1',
      tenant: {
        configuracion: {
          onboarding: {
            telegramOmitidoEn: haceDias(40),
            telegramAvisoDescartadoEn: haceDias(1),
          },
        },
      },
    })

    const body = await (await get()).json()

    expect(body.telegramAvisoDescartado).toBe(true)
  })

  it('a los 29 días el descarte todavía vale', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({
      id: 'u1',
      tenantId: 't1',
      tenant: { configuracion: { onboarding: { telegramAvisoDescartadoEn: haceDias(29) } } },
    })

    const body = await (await get()).json()

    expect(body.telegramAvisoDescartado).toBe(true)
  })

  it('descartado hace más de 30 días y sin bot: el aviso vuelve', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({
      id: 'u1',
      tenantId: 't1',
      tenant: {
        configuracion: {
          onboarding: {
            telegramOmitidoEn: haceDias(60),
            telegramAvisoDescartadoEn: haceDias(31),
          },
        },
      },
    })

    const body = await (await get()).json()

    expect(body).toMatchObject({
      telegramOmitido: true,
      telegramConnected: false,
      telegramAvisoDescartado: false,
    })
  })

  it('silenciado hace poco cuenta como silenciado', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({
      id: 'u1',
      tenantId: 't1',
      tenant: {
        configuracion: {
          onboarding: { telegramOmitidoEn: haceDias(12), telegramAvisoSilenciadoEn: haceDias(3) },
        },
      },
    })

    const body = await (await get()).json()

    expect(body.telegramAvisoSilenciado).toBe(true)
    expect(body.telegramAvisoDescartado).toBe(false)
  })

  it('el silencio dura 7 días: al octavo el aviso vuelve', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({
      id: 'u1',
      tenantId: 't1',
      tenant: {
        configuracion: {
          onboarding: { telegramOmitidoEn: haceDias(12), telegramAvisoSilenciadoEn: haceDias(8) },
        },
      },
    })

    const body = await (await get()).json()

    expect(body.telegramAvisoSilenciado).toBe(false)
    expect(body.telegramOmitido).toBe(true)
  })

  it('el descarte caducado no importa si el bot ya está conectado', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({
      id: 'u1',
      tenantId: 't1',
      tenant: { configuracion: { onboarding: { telegramAvisoDescartadoEn: haceDias(90) } } },
    })
    mocks.prisma.channel.findFirst.mockResolvedValue({ config: { botUsername: 'volkern_bot' } })

    const body = await (await get()).json()

    expect(body.telegramConnected).toBe(true)
  })

  it('una marca ilegible no silencia el aviso para siempre', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({
      id: 'u1',
      tenantId: 't1',
      tenant: { configuracion: { onboarding: { telegramAvisoDescartadoEn: 'ayer' } } },
    })

    const body = await (await get()).json()

    expect(body.telegramAvisoDescartado).toBe(false)
  })

  it('cuenta como conectado si el bot vino por la integración legacy', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({
      id: 'u1',
      tenantId: 't1',
      tenant: { configuracion: { onboarding: { telegramOmitidoEn: '2026-10-30T08:00:00.000Z' } } },
    })
    mocks.prisma.integration.findFirst.mockResolvedValue({ id: 'int_1' })

    const body = await (await get()).json()

    expect(body.telegramConnected).toBe(true)
  })

  it('tenant sin ninguna marca', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({
      id: 'u1',
      tenantId: 't1',
      tenant: { configuracion: null },
    })

    const body = await (await get()).json()

    expect(body).toMatchObject({
      telegramOmitido: false,
      telegramAvisoDescartado: false,
      telegramOmitidoEn: null,
    })
  })
})

describe('POST /api/onboarding/quick — el cuerpo se lee una sola vez', () => {
  it('guarda módulos con un request cuyo json() solo responde una vez', async () => {
    const res = await POST(peticion({ step: 'modules', modules: ['hospitality'] }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(mocks.prisma.tenantFeature.createMany).toHaveBeenCalled()
  })

  it('guarda el perfil con el mismo criterio', async () => {
    const res = await POST(peticion({ step: 'profile', perfil: 'hospitality', nif: 'B12345678' }))

    expect(res.status).toBe(200)
    expect(mocks.prisma.tenant.update).toHaveBeenCalled()
    expect(mocks.prisma.tenant.update.mock.calls[0][0].data.configuracion.perfil).toBe(
      'hospitality'
    )
  })
})
