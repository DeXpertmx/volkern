/**
 * Límite por IP de updates con `secret_token` inválido.
 *
 * Verificar la cabecera de un secret **desconocido** obliga a recorrer los bots
 * de los tenants (consulta a base de datos) la primera vez de cada secret: un
 * cliente que rota cabeceras falsas hace un escaneo por intento. Aquí se corta
 * antes: cuando una IP acumula `MAX_FALLOS` fallos en la ventana, se marca en
 * Redis y los siguientes updates de esa IP se rechazan con **429 sin verificar**
 * (y por tanto sin tocar la base).
 *
 * Qué cuenta como fallo: un update cuya verificación termina en `invalida`
 * —cabecera que no es de ningún bot, o (con `TELEGRAM_WEBHOOK_REQUIRE_SECRET`)
 * un update sin cabecera. Los updates válidos no consumen cuota.
 *
 * Redis con fallback en memoria (misma semántica que `chat-rate-limit`): si
 * Redis no está o falla, el límite sigue funcionando por proceso.
 *
 * Nota de despliegue: la IP sale de `X-Forwarded-For` (primera entrada) o
 * `X-Real-IP`. Detrás del proxy del VPS ambas las escribe el proxy; si la app
 * quedara expuesta sin proxy, un cliente podría falsificar la cabecera y solo
 * conseguiría bloquearse a sí mismo o a la IP que declare.
 */
import { initRedis } from '@/lib/core/redis'

const PREFIJO_FALLOS = 'telegram:webhook-secret:fallos:'
const PREFIJO_BLOQUEO = 'telegram:webhook-secret:bloqueo:'

/** Fallos por ventana antes de bloquear. */
const MAX_FALLOS_DEFECTO = 5
/** Ventana del contador de fallos. */
const VENTANA_SEGUNDOS = 60
/** Duración del bloqueo (con el contador ya gastado). */
const BLOQUEO_SEGUNDOS = 600
/** Tope del fallback en memoria. */
const MEMORIA_MAX = 1000

/** Fallos permitidos por ventana (`TELEGRAM_SECRET_MAX_FALLOS`). */
export function maxFallos(): number {
  const raw = process.env.TELEGRAM_SECRET_MAX_FALLOS
  if (!raw) return MAX_FALLOS_DEFECTO
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : MAX_FALLOS_DEFECTO
}

/** Segundos de bloqueo (para el `Retry-After`). */
export function segundosBloqueo(): number {
  return BLOQUEO_SEGUNDOS
}

/**
 * IP del cliente a partir de las cabeceras del proxy.
 * Devuelve `null` si no hay ninguna utilizable (entonces no se limita).
 */
export function ipDeRequest(headers: Headers): string | null {
  const forwarded = headers.get('x-forwarded-for')
  const primera = forwarded?.split(',')[0] ?? ''
  const ip = (primera || headers.get('x-real-ip') || '').trim()
  if (!ip) return null
  // Cota defensiva: la IP solo se usa como clave, no se interpreta.
  return ip.slice(0, 64)
}

export interface IpSecretLimitEntry {
  ip: string
  /** Fallos acumulados (bloqueo) o fallos de la ventana actual (sin bloquear). */
  fallos: number
  /** Segundos restantes del bloqueo o de la ventana de fallos. */
  restanteSegundos: number | null
}

export interface SecretLimitMetrics {
  /** IPs bloqueadas ahora mismo, la que más fallos acumula primero. */
  bloqueadas: IpSecretLimitEntry[]
  /** IPs con fallos en la ventana actual pero aún sin bloqueo. */
  fallos: IpSecretLimitEntry[]
  totalBloqueadas: number
  totalFallos: number
}

// ─── Fallback en memoria (una sola instancia, sin Redis) ─────────────────
const memoriaFallos = new Map<string, { fallos: number; expira: number }>()
const memoriaBloqueo = new Map<string, { fallos: number; expira: number }>()

function incrMemoria(ip: string): number {
  const ahora = Date.now()
  const actual = memoriaFallos.get(ip)
  if (!actual || actual.expira <= ahora) {
    memoriaFallos.set(ip, { fallos: 1, expira: ahora + VENTANA_SEGUNDOS * 1000 })
  } else {
    actual.fallos += 1
  }
  if (memoriaFallos.size > MEMORIA_MAX) {
    for (const [k, v] of memoriaFallos) {
      if (v.expira <= ahora) memoriaFallos.delete(k)
    }
  }
  return memoriaFallos.get(ip)!.fallos
}

function bloqueadaMemoria(ip: string): boolean {
  const entrada = memoriaBloqueo.get(ip)
  if (!entrada) return false
  if (entrada.expira <= Date.now()) {
    memoriaBloqueo.delete(ip)
    return false
  }
  return true
}

// ─── API ─────────────────────────────────────────────────────────────────

/** ¿Esta IP está bloqueada por fallos de secret? Consulta barata, sin base de datos. */
export async function ipBloqueada(ip: string): Promise<boolean> {
  if (!ip) return false
  const clave = PREFIJO_BLOQUEO + ip

  const redis = await initRedis()
  if (redis) {
    try {
      return (await redis.get(clave)) !== null
    } catch (error) {
      console.warn(
        '[TelegramSecretLimit] Redis falló al leer el bloqueo, usando memoria:',
        (error as Error).message
      )
    }
  }

  return bloqueadaMemoria(ip)
}

/**
 * Registra un fallo de verificación para la IP y, si alcanza el umbral, la
 * bloquea. Devuelve el estado resultante (informativo/logs).
 */
export async function registrarFalloSecret(
  ip: string
): Promise<{ fallos: number; bloqueada: boolean }> {
  if (!ip) return { fallos: 0, bloqueada: false }

  const max = maxFallos()
  const claveFallos = PREFIJO_FALLOS + ip
  let fallos = 0

  const redis = await initRedis()
  if (redis) {
    try {
      fallos = Number(await redis.incr(claveFallos))
      // La ventana se fija con el primer fallo: no se desliza con cada intento.
      if (fallos === 1) await redis.expire(claveFallos, VENTANA_SEGUNDOS)
    } catch (error) {
      console.warn(
        '[TelegramSecretLimit] Redis falló al contar fallos, usando memoria:',
        (error as Error).message
      )
      fallos = incrMemoria(ip)
    }
  } else {
    fallos = incrMemoria(ip)
  }

  if (fallos < max) return { fallos, bloqueada: false }

  if (redis) {
    try {
      await redis.set(PREFIJO_BLOQUEO + ip, String(fallos), 'EX', BLOQUEO_SEGUNDOS)
    } catch (error) {
      console.warn(
        '[TelegramSecretLimit] Redis falló al bloquear la IP:',
        (error as Error).message
      )
    }
  }
  memoriaBloqueo.set(ip, { fallos, expira: Date.now() + BLOQUEO_SEGUNDOS * 1000 })

  console.warn(
    `[TelegramSecretLimit] IP ${ip} bloqueada ${BLOQUEO_SEGUNDOS}s tras ${fallos} secrets inválidos`
  )

  return { fallos, bloqueada: true }
}

export interface ResultadoDesbloqueo {
  /** Había un bloqueo activo para esa IP. */
  estabaBloqueada: boolean
  /** Fallos que se han borrado con el desbloqueo (bloqueo o ventana). */
  fallosPrevios: number
}

/**
 * Desbloquea una IP a mano desde el panel: borra su marca de bloqueo y el
 * contador de fallos de la ventana, en Redis y en el fallback en memoria.
 *
 * Se borran las dos claves a propósito: si solo se quitara el bloqueo, el
 * contador ya gastado haría que el siguiente secret inválido de esa misma IP la
 * bloqueara otra vez de inmediato.
 */
export async function desbloquearIp(ip: string): Promise<ResultadoDesbloqueo> {
  if (!ip) return { estabaBloqueada: false, fallosPrevios: 0 }

  const claveBloqueo = PREFIJO_BLOQUEO + ip
  const claveFallos = PREFIJO_FALLOS + ip

  const bloqueoMemoria = memoriaBloqueo.get(ip)
  const fallosMemoria = memoriaFallos.get(ip)

  let estabaBloqueada = Boolean(bloqueoMemoria && bloqueoMemoria.expira > Date.now())
  let fallosPrevios = bloqueoMemoria?.fallos ?? fallosMemoria?.fallos ?? 0

  const redis = await initRedis()
  if (redis) {
    try {
      const [valorBloqueo, valorFallos] = await Promise.all([
        redis.get(claveBloqueo),
        redis.get(claveFallos),
      ])
      if (valorBloqueo !== null) {
        estabaBloqueada = true
        fallosPrevios = Number(valorBloqueo) || fallosPrevios
      } else if (valorFallos !== null) {
        fallosPrevios = Number(valorFallos) || fallosPrevios
      }
      await redis.del(claveBloqueo, claveFallos)
    } catch (error) {
      console.warn(
        '[TelegramSecretLimit] Redis falló al desbloquear la IP:',
        (error as Error).message
      )
    }
  }

  memoriaBloqueo.delete(ip)
  memoriaFallos.delete(ip)

  if (estabaBloqueada) {
    console.warn(
      `[TelegramSecretLimit] IP ${ip} desbloqueada manualmente (${fallosPrevios} fallos descartados)`
    )
  }

  return { estabaBloqueada, fallosPrevios }
}

/**
 * Estado actual del cortafuegos para el panel de estado del webhook: IPs
 * bloqueadas (con lo que les queda) e IPs con fallos aún sin bloqueo.
 *
 * Lectura barata: SCAN de las dos familias de claves + GET/TTL. Si Redis no
 * está, se lee el fallback en memoria del proceso.
 */
export async function getSecretLimitMetrics(): Promise<SecretLimitMetrics> {
  const redis = await initRedis()
  if (redis) {
    try {
      const [clavesBloqueo, clavesFallos] = await Promise.all([
        escanearClaves(redis, PREFIJO_BLOQUEO + '*'),
        escanearClaves(redis, PREFIJO_FALLOS + '*'),
      ])

      const bloqueadas: IpSecretLimitEntry[] = []
      for (const clave of clavesBloqueo) {
        const [valor, ttl] = await Promise.all([redis.get(clave), redis.ttl(clave)])
        bloqueadas.push({
          ip: clave.slice(PREFIJO_BLOQUEO.length),
          fallos: Number(valor ?? 0),
          restanteSegundos: ttl > 0 ? ttl : null,
        })
      }

      const fallos: IpSecretLimitEntry[] = []
      for (const clave of clavesFallos) {
        const [valor, ttl] = await Promise.all([redis.get(clave), redis.ttl(clave)])
        fallos.push({
          ip: clave.slice(PREFIJO_FALLOS.length),
          fallos: Number(valor ?? 0),
          restanteSegundos: ttl > 0 ? ttl : null,
        })
      }

      return ordenarMetricas(bloqueadas, fallos)
    } catch (error) {
      console.warn(
        '[TelegramSecretLimit] Redis falló al leer las métricas, usando memoria:',
        (error as Error).message
      )
    }
  }

  return metricasDeMemoria()
}

async function escanearClaves(
  redis: NonNullable<Awaited<ReturnType<typeof initRedis>>>,
  patron: string
): Promise<string[]> {
  const claves: string[] = []
  let cursor = '0'
  do {
    const [siguiente, lote] = await redis.scan(cursor, 'MATCH', patron, 'COUNT', 200)
    cursor = siguiente
    claves.push(...lote)
  } while (cursor !== '0')
  return claves
}

function ordenarMetricas(
  bloqueadas: IpSecretLimitEntry[],
  fallos: IpSecretLimitEntry[]
): SecretLimitMetrics {
  const porFallos = (a: IpSecretLimitEntry, b: IpSecretLimitEntry) =>
    b.fallos - a.fallos || a.ip.localeCompare(b.ip)
  return {
    bloqueadas: [...bloqueadas].sort(porFallos),
    fallos: [...fallos].sort(porFallos),
    totalBloqueadas: bloqueadas.length,
    totalFallos: fallos.reduce((suma, f) => suma + f.fallos, 0),
  }
}

function metricasDeMemoria(): SecretLimitMetrics {
  const ahora = Date.now()

  const bloqueadas: IpSecretLimitEntry[] = []
  for (const [ip, entrada] of memoriaBloqueo) {
    if (entrada.expira <= ahora) continue
    bloqueadas.push({
      ip,
      fallos: entrada.fallos,
      restanteSegundos: Math.ceil((entrada.expira - ahora) / 1000),
    })
  }

  const fallos: IpSecretLimitEntry[] = []
  for (const [ip, entrada] of memoriaFallos) {
    if (entrada.expira <= ahora) continue
    fallos.push({
      ip,
      fallos: entrada.fallos,
      restanteSegundos: Math.ceil((entrada.expira - ahora) / 1000),
    })
  }

  return ordenarMetricas(bloqueadas, fallos)
}

/** Limpieza del fallback en memoria (solo tests). */
export function _clearMemorySecretLimit() {
  memoriaFallos.clear()
  memoriaBloqueo.clear()
}
