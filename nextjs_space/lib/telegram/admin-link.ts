import crypto from 'node:crypto'
import { prisma } from '@/lib/db'

/**
 * Enlace de un solo uso para vincular el chat de administración de un tenant.
 *
 * El problema que resuelve: hoy el único camino para fijar el
 * `admin_chat_id` es `/start <tenantId>`, es decir, vincular por posesión de un
 * identificador que no es un secreto. Cualquiera que lo conozca puede mover un
 * chat a otro espacio de trabajo (y, si es suyo, recibir los avisos de esa
 * empresa). Este módulo da el sustituto para poder retirar ese formato: el
 * panel genera un token corto, de un solo uso, y el enlace del QR lo lleva
 * dentro (`/start a_<token>`).
 *
 * Se guarda junto al propio `admin_chat_id`, en las credenciales de la
 * integración o en la config del canal de Telegram, para no añadir un modelo
 * nuevo ni una migración. Es el mismo sitio que ya escribe
 * `vincularChatComoAdmin`, así que vincular y gastar el token pueden ir juntos.
 *
 * Vida corta y un solo uso: caduca a los 15 minutos y se borra al vincular.
 * No se guarda el hash porque el token convive con el propio token del bot en
 * ese JSON: quien pueda leer uno ya controla el bot entero.
 */

export const TOKEN_ADMIN_PREFIJO = 'a_'

/** Validez del enlace. Lo justo para abrir Telegram y pulsar. */
export const TOKEN_ADMIN_TTL_MS = 15 * 60 * 1000

const CAMPO_TOKEN = 'admin_link_token'
const CAMPO_EXPIRA = 'admin_link_token_exp'

/**
 * Usuario del panel que pidió el enlace. No es un secreto: existe para que la
 * auditoría del vínculo pueda decir a nombre de quién se generó cuando el
 * `/start` llega desde Telegram (donde el único actor visible es una cuenta de
 * Telegram). Los enlaces anteriores a este campo no lo tienen.
 */
const CAMPO_SOLICITADO_POR = 'admin_link_solicitado_por'

/**
 * Marca de cuándo se vinculó el chat. La escribe `vincularChatComoAdmin` al
 * gastar el token; los vínculos anteriores no la tienen (se muestran sin fecha
 * en vez de inventarla).
 */
const CAMPO_VINCULADO_EN = 'admin_chat_vinculado_en'
const CAMPO_VINCULADO_EN_CANAL = 'adminChatVinculadoEn'

export interface EstadoVinculoAdmin {
  /** Hay un chat fijado como administración del tenant. */
  vinculado: boolean
  /** Chat de Telegram vinculado, si lo hay. */
  chatId: string | null
  /** ISO del vínculo; `null` si se vinculó antes de registrar la fecha. */
  desde: string | null
  /** Nombre del bot sin `@`, para mostrarlo en el panel. */
  botUsername: string | null
}

export interface VinculoAdminResuelto {
  tenantId: string
  /** Usuario del panel que pidió el enlace; `null` si no consta. */
  solicitadoPor: string | null
}

export interface EnlaceVinculoAdmin {
  token: string
  /** ISO de caducidad. */
  expiraEn: string
  /** `https://t.me/<bot>?start=a_<token>`, o null si no se conoce el bot. */
  enlace: string | null
  /** Nombre del bot sin `@`, para mostrarlo en el panel. */
  botUsername: string | null
}

interface DestinoTelegram {
  tipo: 'integration' | 'channel'
  id: string
  /** Copia mutable del JSON donde vive el vínculo. */
  datos: Record<string, any>
  botUsername: string | null
}

function generaToken(): string {
  return crypto.randomBytes(16).toString('hex')
}

function caducado(expira: unknown, ahora = Date.now()): boolean {
  if (typeof expira === 'number') return expira <= ahora
  if (typeof expira === 'string') {
    const t = Date.parse(expira)
    // Un valor ilegible se trata como caducado: ante la duda, no se vincula.
    return Number.isNaN(t) ? true : t <= ahora
  }
  return true
}

function chatAdminDe(datos: Record<string, any>): string | null {
  const bruto = datos.admin_chat_id ?? datos.adminChatId ?? null
  if (bruto === null || bruto === undefined || bruto === '') return null
  return String(bruto)
}

function fechaVinculoDe(datos: Record<string, any>): string | null {
  const bruto = datos[CAMPO_VINCULADO_EN] ?? datos[CAMPO_VINCULADO_EN_CANAL] ?? null
  if (typeof bruto !== 'string') return null
  return Number.isNaN(Date.parse(bruto)) ? null : bruto
}

function solicitadoPorDe(datos: Record<string, any>): string | null {
  const bruto = datos[CAMPO_SOLICITADO_POR]
  if (typeof bruto !== 'string' || !bruto.trim()) return null
  return bruto.trim()
}

function nombreBotDe(datos: Record<string, any>): string | null {
  const bruto = datos.bot_username ?? datos.botUsername ?? datos.username ?? null
  if (typeof bruto !== 'string' || !bruto.trim()) return null
  return bruto.trim().replace(/^@/, '')
}

async function destinoDelTenant(tenantId: string): Promise<DestinoTelegram | null> {
  const integration = await prisma.integration.findFirst({
    where: { tenantId, tipo: 'telegram', activo: true },
    select: { id: true, credenciales: true },
  })
  if (integration) {
    const datos = { ...((integration.credenciales as any) || {}) }
    return { tipo: 'integration', id: integration.id, datos, botUsername: nombreBotDe(datos) }
  }

  const channel = await prisma.channel.findFirst({
    where: { tenantId, type: 'telegram' },
    select: { id: true, config: true },
  })
  if (channel) {
    const datos = { ...((channel.config as any) || {}) }
    return { tipo: 'channel', id: channel.id, datos, botUsername: nombreBotDe(datos) }
  }

  return null
}

async function guardarDestino(destino: DestinoTelegram): Promise<void> {
  if (destino.tipo === 'integration') {
    await prisma.integration.update({
      where: { id: destino.id },
      data: { credenciales: destino.datos },
    })
    return
  }
  await prisma.channel.update({
    where: { id: destino.id },
    data: { config: destino.datos },
  })
}

/**
 * Estado del vínculo de administración del tenant, para mostrarlo en el panel.
 *
 * Distingue tres casos que el panel no puede adivinar por su cuenta: hay chat y
 * se sabe cuándo, hay chat pero el vínculo es anterior a la marca de fecha, y no
 * hay chat (los avisos no le llegan a nadie todavía).
 *
 * Devuelve `null` si el tenant no tiene integración ni canal de Telegram.
 */
export async function estadoVinculoAdmin(tenantId: string): Promise<EstadoVinculoAdmin | null> {
  const destino = await destinoDelTenant(tenantId)
  if (!destino) return null

  const chatId = chatAdminDe(destino.datos)
  return {
    vinculado: chatId !== null,
    chatId,
    desde: chatId ? fechaVinculoDe(destino.datos) : null,
    botUsername: destino.botUsername,
  }
}

/**
 * Desvincula el chat de administración del tenant: deja de recibir los avisos
 * de la empresa hasta que se vincule otro.
 *
 * También invalida el enlace pendiente, para que uno generado antes de la baja
 * no vuelva a enganchar el chat sin que nadie lo pida. No toca los vínculos
 * personales (`User.metadata.telegram_chat_id`): esos se gestionan desde el
 * perfil de cada usuario y son otra cosa (avisos a una persona, no a la
 * empresa).
 *
 * Devuelve `true` solo si había un chat que desvincular; con el tenant sin chat
 * no se escribe nada.
 */
export async function desvincularChatAdmin(tenantId: string): Promise<boolean> {
  const destino = await destinoDelTenant(tenantId)
  if (!destino) return false
  if (!chatAdminDe(destino.datos)) return false

  delete destino.datos.admin_chat_id
  delete destino.datos.adminChatId
  delete destino.datos[CAMPO_VINCULADO_EN]
  delete destino.datos[CAMPO_VINCULADO_EN_CANAL]
  delete destino.datos[CAMPO_TOKEN]
  delete destino.datos[CAMPO_EXPIRA]
  delete destino.datos[CAMPO_SOLICITADO_POR]

  await guardarDestino(destino)
  return true
}

/**
 * Genera (y guarda) un token nuevo para el tenant. Regenerar invalida el
 * anterior: solo hay un enlace vivo por tenant a la vez.
 *
 * `solicitadoPorUsuarioId` se guarda con el token para que el vínculo pueda
 * auditarse a nombre de quien lo pidió: el `/start` lo pulsa una cuenta de
 * Telegram, que no es un usuario del panel.
 *
 * Devuelve `null` si el tenant no tiene integración ni canal de Telegram: sin
 * bot propio no hay a dónde mandar el `/start`.
 */
export async function crearEnlaceVinculoAdmin(
  tenantId: string,
  solicitadoPorUsuarioId?: string | null
): Promise<EnlaceVinculoAdmin | null> {
  const destino = await destinoDelTenant(tenantId)
  if (!destino) return null

  const token = generaToken()
  const expiraEn = new Date(Date.now() + TOKEN_ADMIN_TTL_MS).toISOString()

  destino.datos[CAMPO_TOKEN] = token
  destino.datos[CAMPO_EXPIRA] = expiraEn
  // Regenerar sin solicitante no puede heredar el de un enlace anterior: la
  // auditoría diría que lo pidió alguien que no lo pidió.
  if (solicitadoPorUsuarioId) destino.datos[CAMPO_SOLICITADO_POR] = solicitadoPorUsuarioId
  else delete destino.datos[CAMPO_SOLICITADO_POR]
  await guardarDestino(destino)

  return {
    token,
    expiraEn,
    botUsername: destino.botUsername,
    enlace: destino.botUsername
      ? `https://t.me/${destino.botUsername}?start=${TOKEN_ADMIN_PREFIJO}${token}`
      : null,
  }
}

/**
 * Tenant dueño del token, o `null` si no existe, ya se gastó o caducó.
 *
 * Recorre las integraciones y canales de Telegram: `/start` es una acción
 * humana y esporádica, así que se prefiere una lectura completa a mantener un
 * índice que haya que invalidar en cada alta.
 */
export async function resolverVinculoAdminPorToken(
  token: string
): Promise<VinculoAdminResuelto | null> {
  if (!token || !/^[a-f0-9]{32}$/i.test(token)) return null
  const ahora = Date.now()

  const integrations = await prisma.integration.findMany({
    where: { tipo: 'telegram', activo: true },
    select: { tenantId: true, credenciales: true },
  })
  for (const integration of integrations) {
    const datos = (integration.credenciales as any) || {}
    if (datos[CAMPO_TOKEN] !== token) continue
    if (caducado(datos[CAMPO_EXPIRA], ahora)) return null
    return { tenantId: integration.tenantId, solicitadoPor: solicitadoPorDe(datos) }
  }

  const channels = await prisma.channel.findMany({
    where: { type: 'telegram' },
    select: { tenantId: true, config: true },
  })
  for (const channel of channels) {
    const datos = (channel.config as any) || {}
    if (datos[CAMPO_TOKEN] !== token) continue
    if (caducado(datos[CAMPO_EXPIRA], ahora)) return null
    return { tenantId: channel.tenantId, solicitadoPor: solicitadoPorDe(datos) }
  }

  return null
}

/**
 * Atajo cuando solo interesa el tenant del token. El webhook usa la versión con
 * el solicitante para poder auditar el vínculo a nombre de quien lo pidió.
 */
export async function resolverTenantPorTokenAdmin(token: string): Promise<string | null> {
  return (await resolverVinculoAdminPorToken(token))?.tenantId ?? null
}

/**
 * Gasta el token del tenant: lo borra de integración y de canal (solo una de
 * las dos lo tendrá). Se llama después de vincular, para que el mismo enlace no
 * pueda reutilizarse.
 */
export async function consumirTokenVinculoAdmin(tenantId: string): Promise<void> {
  try {
    const integrations = await prisma.integration.findMany({
      where: { tenantId, tipo: 'telegram' },
      select: { id: true, credenciales: true },
    })
    for (const integration of integrations) {
      const datos = { ...((integration.credenciales as any) || {}) }
      if (!datos[CAMPO_TOKEN] && !datos[CAMPO_EXPIRA] && !datos[CAMPO_SOLICITADO_POR]) continue
      delete datos[CAMPO_TOKEN]
      delete datos[CAMPO_EXPIRA]
      delete datos[CAMPO_SOLICITADO_POR]
      await prisma.integration.update({ where: { id: integration.id }, data: { credenciales: datos } })
    }

    const channels = await prisma.channel.findMany({
      where: { tenantId, type: 'telegram' },
      select: { id: true, config: true },
    })
    for (const channel of channels) {
      const config = { ...((channel.config as any) || {}) }
      if (!config[CAMPO_TOKEN] && !config[CAMPO_EXPIRA] && !config[CAMPO_SOLICITADO_POR]) continue
      delete config[CAMPO_TOKEN]
      delete config[CAMPO_EXPIRA]
      delete config[CAMPO_SOLICITADO_POR]
      await prisma.channel.update({ where: { id: channel.id }, data: { config } })
    }
  } catch (error) {
    console.error('[TelegramAdminLink] No se pudo gastar el token de vínculo:', error)
  }
}
