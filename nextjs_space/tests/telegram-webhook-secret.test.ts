/**
 * Secret del webhook de Telegram por bot.
 *
 * Al registrar cada bot con su `secret_token`, Telegram manda
 * `X-Telegram-Bot-Api-Secret-Token` en cada update, así que el servidor sabe
 * qué bot (y por tanto qué tenant) entregó el mensaje. El secret se deriva del
 * token del bot: determinista, sin guardarlo y sin permitir recuperar el token.
 *
 * La resolución se cachea (`hash(secret) → tenantId`) para no recorrer todos
 * los bots en cada update; aquí se fijan los TTL y la invalidación.
 */
// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest'

interface RedisFalso {
  store: Map<string, string>
  get: ReturnType<typeof vi.fn>
  set: ReturnType<typeof vi.fn>
  del: ReturnType<typeof vi.fn>
}

const mocks = vi.hoisted(() => ({
  prisma: {
    integration: { findMany: vi.fn(), findFirst: vi.fn() },
    channel: { findMany: vi.fn(), findFirst: vi.fn() },
  },
  decrypt: vi.fn((v: string) => `descifrado:${v}`),
  initRedis: vi.fn(),
  tokenBotDelTenant: vi.fn(),
}))

vi.mock('@/lib/db', () => ({ prisma: mocks.prisma, default: mocks.prisma }))
vi.mock('@/lib/core/crypto', () => ({ decrypt: mocks.decrypt }))
vi.mock('@/lib/core/redis', () => ({ initRedis: mocks.initRedis }))
vi.mock('@/lib/telegram/context-resolver', () => ({
  tokenBotDelTenant: (...args: unknown[]) => mocks.tokenBotDelTenant(...args),
}))

const {
  secretTokenDelBot,
  botsDeTenants,
  resolverTenantPorSecret,
  verificarCabeceraSecret,
  _clearCacheSecret,
} = await import('@/lib/telegram/webhook-secret')

function crearRedisFalso(): RedisFalso {
  const store = new Map<string, string>()
  return {
    store,
    get: vi.fn(async (k: string) => store.get(k) ?? null),
    set: vi.fn(async (k: string, v: string) => {
      store.set(k, v)
      return 'OK'
    }),
    del: vi.fn(async (k: string) => {
      const existia = store.delete(k)
      return existia ? 1 : 0
    }),
  }
}

let redis: RedisFalso

beforeEach(() => {
  vi.clearAllMocks()
  _clearCacheSecret()
  redis = crearRedisFalso()
  mocks.initRedis.mockResolvedValue(redis)
  mocks.decrypt.mockImplementation((v: string) => `descifrado:${v}`)
  mocks.tokenBotDelTenant.mockResolvedValue('A:token')
  mocks.prisma.integration.findMany.mockResolvedValue([])
  mocks.prisma.channel.findMany.mockResolvedValue([])
})

describe('secretTokenDelBot', () => {
  it('es determinista: el mismo bot produce siempre el mismo secret', () => {
    const uno = secretTokenDelBot('123456:AAAA-bbbb_cccc')
    const dos = secretTokenDelBot('123456:AAAA-bbbb_cccc')
    expect(uno).toBe(dos)
  })

  it('cambia con el token del bot', () => {
    expect(secretTokenDelBot('123:uno')).not.toBe(secretTokenDelBot('123:dos'))
  })

  it('cumple el charset y la longitud que exige Telegram (1-256, A-Za-z0-9_-)', () => {
    const secret = secretTokenDelBot('123456:AAAA-bbbb_cccc')
    expect(secret).toMatch(/^[A-Za-z0-9_-]{1,256}$/)
    expect(secret).toHaveLength(43)
  })

  it('no contiene el token en claro', () => {
    expect(secretTokenDelBot('123456:secreto')).not.toContain('secreto')
  })
})

describe('botsDeTenants', () => {
  it('prefiere la integración legacy y descifra el botToken del canal', async () => {
    mocks.prisma.integration.findMany.mockResolvedValue([
      { tenantId: 'tenant-a', credenciales: { bot_token: 'A:token' } },
    ])
    mocks.prisma.channel.findMany.mockResolvedValue([
      { tenantId: 'tenant-b', config: { botToken: 'cifrado-b' } },
      // tenant-a ya tiene integración: el canal no debe sustituirla
      { tenantId: 'tenant-a', config: { botToken: 'cifrado-a' } },
    ])

    const bots = await botsDeTenants()

    expect(bots).toEqual([
      { tenantId: 'tenant-a', botToken: 'A:token' },
      { tenantId: 'tenant-b', botToken: 'descifrado:cifrado-b' },
    ])
  })

  it('ignora integraciones sin bot_token y canales sin botToken', async () => {
    mocks.prisma.integration.findMany.mockResolvedValue([
      { tenantId: 'sin-token', credenciales: { admin_chat_id: '1' } },
    ])
    mocks.prisma.channel.findMany.mockResolvedValue([
      { tenantId: 'canal-vacio', config: { adminChatId: '2' } },
    ])

    expect(await botsDeTenants()).toEqual([])
  })
})

describe('resolverTenantPorSecret', () => {
  beforeEach(() => {
    mocks.prisma.integration.findMany.mockResolvedValue([
      { tenantId: 'tenant-a', credenciales: { bot_token: 'A:token' } },
      { tenantId: 'tenant-b', credenciales: { bot_token: 'B:token' } },
    ])
  })

  it('devuelve el tenant del bot cuyo secret coincide', async () => {
    const res = await resolverTenantPorSecret(secretTokenDelBot('B:token'))
    expect(res).toEqual({ tenantId: 'tenant-b', botToken: 'B:token' })
  })

  it('devuelve null con un secret que no es de ningún bot', async () => {
    expect(await resolverTenantPorSecret('secret-inventado')).toBeNull()
  })

  it('devuelve null con cabecera vacía, sin consultar la base', async () => {
    expect(await resolverTenantPorSecret('')).toBeNull()
    expect(mocks.prisma.integration.findMany).not.toHaveBeenCalled()
    expect(mocks.initRedis).not.toHaveBeenCalled()
  })

  it('no acepta el hash del token con otro prefijo (versión de derivación)', async () => {
    const otroHash = (await import('crypto'))
      .createHash('sha256')
      .update('otra-cosa:A:token')
      .digest('base64url')
    expect(await resolverTenantPorSecret(otroHash)).toBeNull()
  })
})

describe('caché de la resolución secret → tenant', () => {
  beforeEach(() => {
    mocks.prisma.integration.findMany.mockResolvedValue([
      { tenantId: 'tenant-a', credenciales: { bot_token: 'A:token' } },
    ])
  })

  it('el segundo update del mismo bot no vuelve a recorrer los bots', async () => {
    const secret = secretTokenDelBot('A:token')

    const primera = await resolverTenantPorSecret(secret)
    const segunda = await resolverTenantPorSecret(secret)

    expect(primera).toEqual({ tenantId: 'tenant-a', botToken: 'A:token' })
    expect(segunda).toEqual({ tenantId: 'tenant-a', botToken: 'A:token' })
    // Un solo escaneo de la tabla de integraciones para las dos resoluciones.
    expect(mocks.prisma.integration.findMany).toHaveBeenCalledTimes(1)
    // El token del bot se re-resuelve del tenant en el hit (no se cachea el
    // token): la primera resolución viene del escaneo, la segunda de la caché.
    expect(mocks.tokenBotDelTenant).toHaveBeenCalledWith('tenant-a')
    expect(mocks.tokenBotDelTenant).toHaveBeenCalledTimes(1)
  })

  it('escribe en Redis con TTL y sin el secret ni el token en claro', async () => {
    const secret = secretTokenDelBot('A:token')
    await resolverTenantPorSecret(secret)

    const [clave, valor, exp, ttl] = redis.set.mock.calls[0]
    expect(clave).toMatch(/^telegram:webhook-secret:v1:[0-9a-f]{64}$/)
    expect(clave).not.toContain(secret)
    expect(exp).toBe('EX')
    expect(ttl).toBe(600)
    expect(JSON.parse(valor)).toEqual({ tenantId: 'tenant-a' })
    expect(valor).not.toContain('A:token')
  })

  it('cachea los secrets desconocidos con TTL corto para no escanear en cada intento', async () => {
    mocks.prisma.integration.findMany.mockResolvedValue([
      { tenantId: 'tenant-a', credenciales: { bot_token: 'A:token' } },
    ])

    expect(await resolverTenantPorSecret('secret-falso')).toBeNull()
    expect(await resolverTenantPorSecret('secret-falso')).toBeNull()

    expect(mocks.prisma.integration.findMany).toHaveBeenCalledTimes(1)
    const [, valor, exp, ttl] = redis.set.mock.calls[0]
    expect(exp).toBe('EX')
    expect(ttl).toBe(60)
    expect(JSON.parse(valor)).toEqual({ tenantId: null })
  })

  it('entrada obsoleta (el tenant ya no tiene bot) → se invalida y se vuelve a escanear', async () => {
    const secret = secretTokenDelBot('A:token')
    await resolverTenantPorSecret(secret) // calienta la caché con tenant-a

    // El bot desaparece de la base y el tenant ya no lo tiene.
    mocks.prisma.integration.findMany.mockResolvedValue([])
    mocks.tokenBotDelTenant.mockResolvedValue(null)

    expect(await resolverTenantPorSecret(secret)).toBeNull()

    expect(redis.del).toHaveBeenCalledTimes(1)
    // Se re-escaneó (la entrada obsoleta no se da por buena).
    expect(mocks.prisma.integration.findMany).toHaveBeenCalledTimes(2)
  })

  it('sin Redis cae a la caché en memoria y no re-escanea', async () => {
    mocks.initRedis.mockResolvedValue(null)
    const secret = secretTokenDelBot('A:token')

    await resolverTenantPorSecret(secret)
    await resolverTenantPorSecret(secret)

    expect(mocks.prisma.integration.findMany).toHaveBeenCalledTimes(1)
  })

  it('si Redis falla, degrada sin romper la resolución', async () => {
    redis.get.mockRejectedValue(new Error('conn refused'))

    const secret = secretTokenDelBot('A:token')
    expect(await resolverTenantPorSecret(secret)).toEqual({
      tenantId: 'tenant-a',
      botToken: 'A:token',
    })
  })
})

describe('verificarCabeceraSecret', () => {
  beforeEach(() => {
    mocks.prisma.integration.findMany.mockResolvedValue([
      { tenantId: 'tenant-a', credenciales: { bot_token: 'A:token' } },
    ])
  })

  it('sin cabecera y sin exigirla → sin_cabecera (se sigue resolviendo por vínculos)', async () => {
    expect(await verificarCabeceraSecret(null)).toEqual({ estado: 'sin_cabecera' })
    expect(await verificarCabeceraSecret('   ')).toEqual({ estado: 'sin_cabecera' })
  })

  it('sin cabecera y exigiéndola → invalida', async () => {
    expect(await verificarCabeceraSecret(null, { requerir: true })).toEqual({
      estado: 'invalida',
    })
  })

  it('cabecera válida → tenant y bot token del bot que la envió', async () => {
    expect(await verificarCabeceraSecret(secretTokenDelBot('A:token'))).toEqual({
      estado: 'valida',
      tenantId: 'tenant-a',
      botToken: 'A:token',
    })
  })

  it('cabecera que no es de ningún bot → invalida, aunque se exija o no', async () => {
    expect(await verificarCabeceraSecret('falsa')).toEqual({ estado: 'invalida' })
    expect(await verificarCabeceraSecret('falsa', { requerir: true })).toEqual({
      estado: 'invalida',
    })
  })
})
