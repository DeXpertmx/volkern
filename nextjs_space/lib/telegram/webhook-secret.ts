/**
 * Secret del webhook por bot: cierra la ambigüedad de «¿qué bot recibió este
 * update?».
 *
 * Todos los bots de tenants apuntan al mismo endpoint (`/api/webhooks/telegram`),
 * así que por el payload no se puede saber cuál lo entregó. Telegram permite
 * registrar cada webhook con un `secret_token`: lo devuelve en la cabecera
 * `X-Telegram-Bot-Api-Secret-Token` en cada update. Si cada bot usa un secret
 * distinto, el header **identifica al bot** y con él al tenant, sin adivinar por
 * vínculos ni por historial.
 *
 * El secret se **deriva** del token del bot (SHA-256 con prefijo de versión):
 *  - es determinista (re-registrar no cambia nada y se puede recalcular siempre);
 *  - no se guarda en la base de datos ni en el repositorio;
 *  - no permite recuperar el token (hash) y solo se envía a Telegram por TLS;
 *  - cumple el charset que exige Telegram (`A-Za-z0-9_-`, 1-256 chars): base64url.
 *
 * El registro lo hace `scripts/register-telegram-webhooks.ts`. Este módulo solo
 * deriva y valida.
 *
 * Compatibilidad: si el bot aún no se ha re-registrado, Telegram no manda la
 * cabecera y el webhook sigue resolviendo por vínculos (comportamiento anterior).
 * Para exigirla, `TELEGRAM_WEBHOOK_REQUIRE_SECRET=true` (rechaza updates sin
 * cabecera válida).
 *
 * Caché: resolver el secret recorriendo todos los bots de tenants (2 consultas
 * + un descifrado por canal) en cada update no escala. La resolución se cachea
 * en Redis (y en memoria si Redis no está): `hash(secret) → tenantId`, con TTL.
 * Solo se guarda el **tenant**, nunca el token del bot ni el secret en claro; el
 * token se vuelve a resolver del tenant en el hit (y si ya no tiene bot, la
 * entrada se descarta y se vuelve a escanear). La clave es el hash del secret
 * para que un volcado de Redis no revele secretos utilizables.
 */
import { createHash, timingSafeEqual } from 'crypto'
import { prisma } from '@/lib/db'
import { initRedis } from '@/lib/core/redis'
import { tokenBotDelTenant } from '@/lib/telegram/context-resolver'

/** Cabecera con la que Telegram entrega el `secret_token` del webhook. */
export const TELEGRAM_SECRET_HEADER = 'x-telegram-bot-api-secret-token'

/** Prefijo de versión de la derivación (cambiarlo invalida los registros). */
const DERIVACION = 'volkern:telegram:webhook:v1:'

/** Caché de la resolución secret → tenant. */
const CACHE_PREFIJO = 'telegram:webhook-secret:v1:'
/** TTL de una resolución válida (un bot recién conectado tarda como mucho esto en verse). */
const CACHE_TTL_SEGUNDOS = 600
/** TTL de un secret desconocido: acota el coste de updates falsificados sin bloquear un alta 10 min. */
const CACHE_TTL_NEGATIVO_SEGUNDOS = 60
/** Tope del fallback en memoria. */
const MEMORIA_MAX = 500

interface EntradaCache {
  tenantId: string | null
  expira: number
}

const cacheMemoria = new Map<string, EntradaCache>()

/** Limpieza del fallback en memoria (solo tests). */
export function _clearCacheSecret() {
  cacheMemoria.clear()
}

/**
 * Secret determinista de un bot. Mismo token → mismo secret, siempre.
 * 43 chars base64url (32 bytes de SHA-256 sin padding).
 */
export function secretTokenDelBot(botToken: string): string {
  return createHash('sha256').update(DERIVACION + botToken, 'utf8').digest('base64url')
}

/** ¿El despliegue exige que los updates traigan cabecera de secret válida? */
export function requiereSecret(): boolean {
  return process.env.TELEGRAM_WEBHOOK_REQUIRE_SECRET === 'true'
}

/** Comparación en tiempo constante tolerante a longitudes distintas. */
function igualesEnTiempoConstante(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8')
  const bufB = Buffer.from(b, 'utf8')
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}

export interface BotDeTenant {
  tenantId: string
  botToken: string
}

/**
 * Todos los bots de tenants (integración legacy en claro > canal moderno
 * cifrado), uno por tenant. No usa el bot del sistema: `TELEGRAM_BOT_TOKEN` no
 * recibe updates de tenants.
 */
export async function botsDeTenants(): Promise<BotDeTenant[]> {
  const [integrations, channels] = await Promise.all([
    prisma.integration.findMany({
      where: { tipo: 'telegram', activo: true },
      select: { tenantId: true, credenciales: true },
    }),
    prisma.channel.findMany({
      where: { type: 'telegram' },
      select: { tenantId: true, config: true },
    }),
  ])

  const bots = new Map<string, string>()

  for (const integration of integrations) {
    const creds = (integration.credenciales as any) || null
    const token = creds?.bot_token
    if (token && !bots.has(integration.tenantId)) {
      bots.set(integration.tenantId, String(token))
    }
  }

  for (const channel of channels) {
    if (bots.has(channel.tenantId)) continue
    const config = (channel.config as any) || null
    if (!config?.botToken) continue
    const { decrypt } = await import('@/lib/core/crypto')
    bots.set(channel.tenantId, decrypt(String(config.botToken)))
  }

  return [...bots.entries()].map(([tenantId, botToken]) => ({ tenantId, botToken }))
}

/**
 * Tenant dueño del bot que entregó el update, según el secret de la cabecera.
 *
 * Devuelve `null` si el secret no corresponde a ningún bot (update falsificado o
 * bot aún sin re-registrar). Si dos tenants comparten el mismo token de bot, el
 * secret es idéntico: es una configuración inválida y se avisa; se devuelve el
 * primero para no romper el flujo, porque el bot es literalmente el mismo.
 */
export async function resolverTenantPorSecret(secret: string): Promise<BotDeTenant | null> {
  if (!secret) return null

  // 1. Caché: hash(secret) → tenantId (nunca el token ni el secret en claro).
  const cacheado = await leerDeCache(secret)
  if (cacheado.encontrado) {
    if (!cacheado.tenantId) return null // secret desconocido (caché negativa)

    const botToken = await tokenBotDelTenant(cacheado.tenantId)
    if (botToken) return { tenantId: cacheado.tenantId, botToken }

    // El tenant ya no tiene ese bot: la entrada está obsoleta. Se descarta y se
    // vuelve a escanear por si el bot se trasladó a otro tenant.
    await borrarDeCache(secret)
  }

  // 2. Sin caché: se recorren los bots de tenants (una vez por secret y TTL).
  let candidatos: BotDeTenant[]
  try {
    candidatos = await botsDeTenants()
  } catch (error) {
    console.error('[TelegramSecret] Error cargando bots de tenants:', error)
    return null
  }

  const coincidencias = candidatos.filter((bot) =>
    igualesEnTiempoConstante(secretTokenDelBot(bot.botToken), secret)
  )

  if (coincidencias.length > 1) {
    console.warn(
      `[TelegramSecret] ${coincidencias.length} tenants comparten el mismo bot de Telegram ` +
        `(${coincidencias.map((c) => c.tenantId).join(', ')}): cada tenant debe usar su propio bot.`
    )
  }

  const resuelto = coincidencias[0] ?? null
  await escribirEnCache(secret, resuelto?.tenantId ?? null)

  return resuelto
}

// ─── Caché de la resolución (Redis con fallback en memoria) ──────────────

/** Clave de caché: hash del secret, para no dejar el secret en claro en Redis. */
function claveDeCache(secret: string): string {
  return CACHE_PREFIJO + createHash('sha256').update(secret, 'utf8').digest('hex')
}

async function leerDeCache(
  secret: string
): Promise<{ encontrado: boolean; tenantId: string | null }> {
  const clave = claveDeCache(secret)

  const redis = await initRedis()
  if (redis) {
    try {
      const raw = await redis.get(clave)
      if (raw !== null) {
        const parsed = JSON.parse(raw)
        return {
          encontrado: true,
          tenantId: typeof parsed?.tenantId === 'string' ? parsed.tenantId : null,
        }
      }
      return { encontrado: false, tenantId: null }
    } catch (error) {
      console.warn('[TelegramSecret] Redis falló al leer la caché:', (error as Error).message)
    }
  }

  const local = cacheMemoria.get(clave)
  if (!local) return { encontrado: false, tenantId: null }
  if (local.expira <= Date.now()) {
    cacheMemoria.delete(clave)
    return { encontrado: false, tenantId: null }
  }
  return { encontrado: true, tenantId: local.tenantId }
}

async function escribirEnCache(secret: string, tenantId: string | null): Promise<void> {
  const clave = claveDeCache(secret)
  const ttl = tenantId ? CACHE_TTL_SEGUNDOS : CACHE_TTL_NEGATIVO_SEGUNDOS

  // Fallback en memoria (también calienta la instancia cuando Redis está caído).
  if (cacheMemoria.size >= MEMORIA_MAX) {
    const ahora = Date.now()
    for (const [k, v] of cacheMemoria) {
      if (v.expira <= ahora) cacheMemoria.delete(k)
    }
    if (cacheMemoria.size >= MEMORIA_MAX) {
      const primera = cacheMemoria.keys().next().value
      if (primera) cacheMemoria.delete(primera)
    }
  }
  cacheMemoria.set(clave, { tenantId, expira: Date.now() + ttl * 1000 })

  const redis = await initRedis()
  if (!redis) return
  try {
    await redis.set(clave, JSON.stringify({ tenantId }), 'EX', ttl)
  } catch (error) {
    console.warn('[TelegramSecret] Redis falló al escribir la caché:', (error as Error).message)
  }
}

async function borrarDeCache(secret: string): Promise<void> {
  const clave = claveDeCache(secret)
  cacheMemoria.delete(clave)
  const redis = await initRedis()
  if (!redis) return
  try {
    await redis.del(clave)
  } catch (error) {
    console.warn('[TelegramSecret] Redis falló al invalidar la caché:', (error as Error).message)
  }
}

export type VerificacionSecret =
  | { estado: 'sin_cabecera' }
  | { estado: 'valida'; tenantId: string; botToken: string }
  | { estado: 'invalida' }

/**
 * Verifica la cabecera del webhook.
 *
 *  - Sin cabecera: `sin_cabecera` (el llamador sigue con la resolución por
 *    vínculos), salvo `requerir: true`, que la convierte en `invalida`.
 *  - Con cabecera que corresponde a un bot: `valida` + tenant y token de ese bot.
 *  - Con cualquier otra cabecera: `invalida` (no se procesa nada).
 */
export async function verificarCabeceraSecret(
  secret: string | null | undefined,
  opciones: { requerir?: boolean } = {}
): Promise<VerificacionSecret> {
  const valor = (secret || '').trim()

  if (!valor) {
    return opciones.requerir ? { estado: 'invalida' } : { estado: 'sin_cabecera' }
  }

  const bot = await resolverTenantPorSecret(valor)
  if (!bot) return { estado: 'invalida' }

  return { estado: 'valida', tenantId: bot.tenantId, botToken: bot.botToken }
}
