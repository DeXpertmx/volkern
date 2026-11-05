/**
 * Cortafuegos por IP para updates con `secret_token` inválido.
 *
 * Verificar un secret desconocido obliga a recorrer los bots de los tenants (una
 * consulta a base de datos), así que una IP que rota cabeceras falsas se bloquea
 * antes de verificar: los siguientes updates se rechazan sin tocar la base.
 */
// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

interface RedisFalso {
  store: Map<string, string>
  ttls: Map<string, number>
  get: ReturnType<typeof vi.fn>
  set: ReturnType<typeof vi.fn>
  incr: ReturnType<typeof vi.fn>
  expire: ReturnType<typeof vi.fn>
  ttl: ReturnType<typeof vi.fn>
  scan: ReturnType<typeof vi.fn>
  del: ReturnType<typeof vi.fn>
}

const mocks = vi.hoisted(() => ({
  initRedis: vi.fn(),
}))

vi.mock('@/lib/core/redis', () => ({ initRedis: mocks.initRedis }))

const {
  ipDeRequest,
  ipBloqueada,
  registrarFalloSecret,
  getSecretLimitMetrics,
  desbloquearIp,
  maxFallos,
  segundosBloqueo,
  _clearMemorySecretLimit,
} = await import('@/lib/telegram/webhook-secret-rate-limit')

function crearRedisFalso(): RedisFalso {
  const store = new Map<string, string>()
  const ttls = new Map<string, number>()
  return {
    store,
    ttls,
    get: vi.fn(async (k: string) => store.get(k) ?? null),
    set: vi.fn(async (k: string, v: string, ...args: unknown[]) => {
      store.set(k, v)
      if (args[0] === 'EX') ttls.set(k, Number(args[1]))
      return 'OK'
    }),
    incr: vi.fn(async (k: string) => {
      const n = Number(store.get(k) ?? 0) + 1
      store.set(k, String(n))
      return n
    }),
    expire: vi.fn(async (k: string, segundos: number) => {
      ttls.set(k, segundos)
      return 1
    }),
    ttl: vi.fn(async (k: string) => ttls.get(k) ?? -1),
    scan: vi.fn(async (_cursor: string, _match: string, patron: string) => {
      const prefijo = patron.replace(/\*$/, '')
      return ['0', [...store.keys()].filter((k) => k.startsWith(prefijo))]
    }),
    del: vi.fn(async (...claves: string[]) => {
      let borradas = 0
      for (const clave of claves) {
        if (store.delete(clave)) borradas += 1
        ttls.delete(clave)
      }
      return borradas
    }),
  }
}

let redis: RedisFalso

beforeEach(() => {
  vi.clearAllMocks()
  _clearMemorySecretLimit()
  delete process.env.TELEGRAM_SECRET_MAX_FALLOS
  redis = crearRedisFalso()
  mocks.initRedis.mockResolvedValue(redis)
})

afterEach(() => {
  vi.useRealTimers()
  _clearMemorySecretLimit()
  delete process.env.TELEGRAM_SECRET_MAX_FALLOS
})

describe('ipDeRequest', () => {
  const headers = (pares: Record<string, string>) => new Headers(pares)

  it('toma la primera IP de X-Forwarded-For', () => {
    expect(
      ipDeRequest(headers({ 'x-forwarded-for': '203.0.113.9, 10.0.0.1, 10.0.0.2' }))
    ).toBe('203.0.113.9')
  })

  it('usa X-Real-IP si no hay X-Forwarded-For', () => {
    expect(ipDeRequest(headers({ 'x-real-ip': '198.51.100.7' }))).toBe('198.51.100.7')
  })

  it('devuelve null sin cabeceras de proxy', () => {
    expect(ipDeRequest(headers({}))).toBeNull()
    expect(ipDeRequest(headers({ 'x-forwarded-for': '   ' }))).toBeNull()
  })

  it('acota la longitud de la clave', () => {
    expect(ipDeRequest(headers({ 'x-forwarded-for': 'a'.repeat(100) }))).toHaveLength(64)
  })
})

describe('umbral', () => {
  it('por defecto son 5 fallos y el bloqueo dura 600 s', () => {
    expect(maxFallos()).toBe(5)
    expect(segundosBloqueo()).toBe(600)
  })

  it('TELEGRAM_SECRET_MAX_FALLOS cambia el umbral', () => {
    process.env.TELEGRAM_SECRET_MAX_FALLOS = '2'
    expect(maxFallos()).toBe(2)
  })

  it('un valor inválido en el entorno vuelve al defecto', () => {
    process.env.TELEGRAM_SECRET_MAX_FALLOS = 'cero'
    expect(maxFallos()).toBe(5)
  })
})

describe('registrarFalloSecret / ipBloqueada', () => {
  it('por debajo del umbral no bloquea', async () => {
    for (let i = 0; i < 4; i++) {
      const res = await registrarFalloSecret('203.0.113.9')
      expect(res.bloqueada).toBe(false)
    }
    expect(await ipBloqueada('203.0.113.9')).toBe(false)
  })

  it('al alcanzar el umbral bloquea la IP y escribe el bloqueo con TTL', async () => {
    for (let i = 0; i < 4; i++) await registrarFalloSecret('203.0.113.9')
    const res = await registrarFalloSecret('203.0.113.9')

    expect(res).toEqual({ fallos: 5, bloqueada: true })
    expect(await ipBloqueada('203.0.113.9')).toBe(true)

    const setBloqueo = redis.set.mock.calls.find(([k]) =>
      String(k).startsWith('telegram:webhook-secret:bloqueo:')
    )
    expect(setBloqueo?.[2]).toBe('EX')
    expect(setBloqueo?.[3]).toBe(600)

    // El contador abre ventana con el primer fallo.
    expect(redis.expire).toHaveBeenCalledWith('telegram:webhook-secret:fallos:203.0.113.9', 60)
  })

  it('cada IP cuenta por separado', async () => {
    for (let i = 0; i < 5; i++) await registrarFalloSecret('203.0.113.9')
    expect(await ipBloqueada('203.0.113.9')).toBe(true)
    expect(await ipBloqueada('198.51.100.7')).toBe(false)
  })

  it('sin IP no cuenta ni bloquea', async () => {
    expect(await registrarFalloSecret('')).toEqual({ fallos: 0, bloqueada: false })
    expect(await ipBloqueada('')).toBe(false)
    expect(redis.incr).not.toHaveBeenCalled()
  })
})

describe('getSecretLimitMetrics (panel de estado)', () => {
  it('sin datos devuelve listas vacías', async () => {
    expect(await getSecretLimitMetrics()).toEqual({
      bloqueadas: [],
      fallos: [],
      totalBloqueadas: 0,
      totalFallos: 0,
    })
  })

  it('expone las IPs bloqueadas con su cuenta atrás y el motivo', async () => {
    for (let i = 0; i < 5; i++) await registrarFalloSecret('203.0.113.9')

    const metrics = await getSecretLimitMetrics()

    expect(metrics.totalBloqueadas).toBe(1)
    expect(metrics.bloqueadas[0]).toEqual({
      ip: '203.0.113.9',
      fallos: 5,
      restanteSegundos: 600,
    })
    // Los fallos de la ventana también se exponen (aún visibles).
    expect(metrics.fallos).toEqual([
      { ip: '203.0.113.9', fallos: 5, restanteSegundos: 60 },
    ])
    expect(metrics.totalFallos).toBe(5)
  })

  it('expone IPs con fallos antes de llegar al bloqueo', async () => {
    await registrarFalloSecret('198.51.100.7')
    await registrarFalloSecret('198.51.100.7')

    const metrics = await getSecretLimitMetrics()

    expect(metrics.bloqueadas).toEqual([])
    expect(metrics.totalBloqueadas).toBe(0)
    expect(metrics.fallos).toEqual([
      { ip: '198.51.100.7', fallos: 2, restanteSegundos: 60 },
    ])
  })

  it('ordena por número de fallos descendente', async () => {
    process.env.TELEGRAM_SECRET_MAX_FALLOS = '10'
    await registrarFalloSecret('10.0.0.1')
    for (let i = 0; i < 3; i++) await registrarFalloSecret('10.0.0.2')

    const metrics = await getSecretLimitMetrics()

    expect(metrics.fallos.map((f) => f.ip)).toEqual(['10.0.0.2', '10.0.0.1'])
  })
})

describe('desbloquearIp (panel de estado)', () => {
  it('libera la IP y borra su contador, de modo que vuelve a pasar', async () => {
    for (let i = 0; i < 5; i++) await registrarFalloSecret('203.0.113.9')
    expect(await ipBloqueada('203.0.113.9')).toBe(true)

    const resultado = await desbloquearIp('203.0.113.9')

    expect(resultado).toEqual({ estabaBloqueada: true, fallosPrevios: 5 })
    expect(await ipBloqueada('203.0.113.9')).toBe(false)
    expect(redis.del).toHaveBeenCalledWith(
      'telegram:webhook-secret:bloqueo:203.0.113.9',
      'telegram:webhook-secret:fallos:203.0.113.9'
    )
    // Sin contador previo, el siguiente fallo no rebrota el bloqueo.
    expect(await registrarFalloSecret('203.0.113.9')).toEqual({ fallos: 1, bloqueada: false })
    expect(await getSecretLimitMetrics()).toEqual({
      bloqueadas: [],
      fallos: [{ ip: '203.0.113.9', fallos: 1, restanteSegundos: 60 }],
      totalBloqueadas: 0,
      totalFallos: 1,
    })
  })

  it('una IP con solo fallos reinicia su ventana sin marcar desbloqueo', async () => {
    await registrarFalloSecret('198.51.100.7')
    await registrarFalloSecret('198.51.100.7')

    expect(await desbloquearIp('198.51.100.7')).toEqual({
      estabaBloqueada: false,
      fallosPrevios: 2,
    })
    expect((await getSecretLimitMetrics()).fallos).toEqual([])
  })

  it('una IP desconocida no escribe ni rompe nada', async () => {
    expect(await desbloquearIp('192.0.2.55')).toEqual({
      estabaBloqueada: false,
      fallosPrevios: 0,
    })
    expect(await desbloquearIp('')).toEqual({ estabaBloqueada: false, fallosPrevios: 0 })
  })

  it('no toca otras IPs bloqueadas', async () => {
    for (let i = 0; i < 5; i++) await registrarFalloSecret('203.0.113.9')
    for (let i = 0; i < 5; i++) await registrarFalloSecret('198.51.100.7')

    await desbloquearIp('203.0.113.9')

    expect(await ipBloqueada('198.51.100.7')).toBe(true)
    expect((await getSecretLimitMetrics()).bloqueadas.map((b) => b.ip)).toEqual([
      '198.51.100.7',
    ])
  })

  it('en modo memoria también libera el bloqueo del proceso', async () => {
    mocks.initRedis.mockResolvedValue(null)
    for (let i = 0; i < 5; i++) await registrarFalloSecret('203.0.113.9')

    expect(await desbloquearIp('203.0.113.9')).toEqual({
      estabaBloqueada: true,
      fallosPrevios: 5,
    })
    expect(await ipBloqueada('203.0.113.9')).toBe(false)
    expect(await getSecretLimitMetrics()).toEqual({
      bloqueadas: [],
      fallos: [],
      totalBloqueadas: 0,
      totalFallos: 0,
    })
  })

  it('si Redis falla al borrar, la IP queda libre en este proceso', async () => {
    for (let i = 0; i < 5; i++) await registrarFalloSecret('203.0.113.9')
    redis.del.mockRejectedValueOnce(new Error('conn refused'))

    await desbloquearIp('203.0.113.9')

    // La marca del bloqueo sigue en Redis, pero el fallback local ya no la ve.
    expect(await ipBloqueada('203.0.113.9')).toBe(true)
  })
})

describe('sin Redis (fallback en memoria)', () => {
  beforeEach(() => {
    mocks.initRedis.mockResolvedValue(null)
  })

  it('bloquea tras el umbral y caduca pasado el tiempo de bloqueo', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-30T10:00:00Z'))

    for (let i = 0; i < 5; i++) await registrarFalloSecret('203.0.113.9')
    expect(await ipBloqueada('203.0.113.9')).toBe(true)

    // Pasado el bloqueo (600 s) la IP vuelve a estar libre.
    vi.setSystemTime(new Date('2026-10-30T10:10:01Z'))
    expect(await ipBloqueada('203.0.113.9')).toBe(false)
  })

  it('si Redis falla al contar, sigue limitando en memoria', async () => {
    mocks.initRedis.mockResolvedValue(redis)
    redis.incr.mockRejectedValue(new Error('conn refused'))

    for (let i = 0; i < 5; i++) await registrarFalloSecret('203.0.113.9')

    expect(await ipBloqueada('203.0.113.9')).toBe(true)
  })

  it('el panel lee el estado desde la memoria del proceso', async () => {
    for (let i = 0; i < 3; i++) await registrarFalloSecret('203.0.113.9')

    const metrics = await getSecretLimitMetrics()

    expect(metrics.bloqueadas).toEqual([])
    expect(metrics.fallos).toHaveLength(1)
    expect(metrics.fallos[0]).toMatchObject({ ip: '203.0.113.9', fallos: 3 })
    expect(metrics.fallos[0].restanteSegundos).toBeGreaterThan(0)
  })
})
