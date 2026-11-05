/**
 * Resolución de contexto de Telegram: a qué tenant pertenece un chat.
 *
 * Regla central (ver `documentacion_tecnica/TELEGRAM_ARQUITECTURA.md`):
 *
 *   **Un chat pertenece a UN solo tenant** y ese tenant usa **su propio bot**.
 *
 * Antes el webhook hacía un fallback a «la primera integración activa con
 * bot_token», con lo que un chat sin vincular se contestaba con los datos de un
 * tenant arbitrario (el primero de la tabla), y `loadTelegramCredentials` caía
 * en `TELEGRAM_ADMIN_CHAT_ID` del entorno para cualquier tenant sin
 * integración: las notificaciones de varios tenants llegaban al mismo chat
 * personal. Aquí se resuelve siempre por vínculo explícito o por historia
 * existente; si no hay una respuesta segura, **no se resuelve** (mejor silencio
 * que datos del tenant equivocado).
 *
 * Fuentes de vínculo chat → tenant:
 *  - `Integration.credenciales.admin_chat_id` (legacy, integración activa)
 *  - `Channel.config.adminChatId` / `admin_chat_id` (modelo moderno)
 *  - `User.metadata.telegram_chat_id` / `metadata.telegram.chat_id` (QR del perfil)
 *  - `Conversation.externalRef === "telegram:<chatId>"` (historia previa; es
 *    único en todo el esquema, así que apunta a un solo tenant)
 */
import { prisma } from '@/lib/db'

export interface ContextoTelegram {
  tenantId: string
  botToken: string
}

export type FuenteVinculo = 'integration' | 'channel' | 'user'

export interface VinculoChat {
  tenantId: string
  fuente: FuenteVinculo
}

const chatIdDe = (valor: unknown): string | null =>
  valor === null || valor === undefined || valor === '' ? null : String(valor)

/**
 * Bot token PROPIO del tenant (integración legacy en claro > canal moderno
 * cifrado con AES). Nunca devuelve el token del entorno: el bot del sistema no
 * habla con datos de tenants.
 */
export async function tokenBotDelTenant(tenantId: string): Promise<string | null> {
  try {
    const integration = await prisma.integration.findFirst({
      where: { tenantId, tipo: 'telegram', activo: true },
      select: { credenciales: true },
    })
    const creds = (integration?.credenciales as any) || null
    if (creds?.bot_token) return String(creds.bot_token)

    const channel = await prisma.channel.findFirst({
      where: { tenantId, type: 'telegram' },
      select: { config: true },
    })
    const config = (channel?.config as any) || null
    if (config?.botToken) {
      const { decrypt } = await import('@/lib/core/crypto')
      return decrypt(config.botToken)
    }
  } catch (error) {
    console.error('[TelegramResolver] Error resolviendo bot del tenant:', error)
  }
  return null
}

/**
 * Todos los tenants que tienen vinculado este chat, con la fuente del vínculo.
 * Un mismo tenant puede aparecer por varias fuentes (se deduplica al resolver).
 */
export async function vinculosDelChat(chatId: string): Promise<VinculoChat[]> {
  const [integrations, channels, users] = await Promise.all([
    prisma.integration.findMany({
      where: { tipo: 'telegram', activo: true },
      select: { tenantId: true, credenciales: true },
    }),
    prisma.channel.findMany({
      where: { type: 'telegram' },
      select: { tenantId: true, config: true },
    }),
    prisma.user.findMany({
      where: {
        OR: [
          { metadata: { path: ['telegram_chat_id'], equals: chatId } },
          { metadata: { path: ['telegram', 'chat_id'], equals: chatId } },
        ],
      },
      select: { tenantId: true },
    }),
  ])

  const vinculos: VinculoChat[] = []

  for (const integration of integrations) {
    const creds = (integration.credenciales as any) || null
    if (chatIdDe(creds?.admin_chat_id) === chatId) {
      vinculos.push({ tenantId: integration.tenantId, fuente: 'integration' })
    }
  }

  for (const channel of channels) {
    const config = (channel.config as any) || null
    const enlazado = chatIdDe(config?.adminChatId ?? config?.admin_chat_id)
    if (enlazado === chatId) {
      vinculos.push({ tenantId: channel.tenantId, fuente: 'channel' })
    }
  }

  for (const user of users) {
    if (user.tenantId) {
      vinculos.push({ tenantId: user.tenantId, fuente: 'user' })
    }
  }

  return vinculos
}

/** Tenant con conversación previa de este chat (`telegram:<chatId>`). */
async function tenantConversacion(chatId: string): Promise<string | null> {
  try {
    const conv = await prisma.conversation.findFirst({
      where: { externalRef: `telegram:${chatId}` },
      select: { tenantId: true },
    })
    return conv?.tenantId || null
  } catch {
    return null
  }
}

/** Tenants que hoy tienen un bot de Telegram propio (integración o canal). */
export async function tenantsConBotPropio(): Promise<string[]> {
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

  const tenants = new Set<string>()
  for (const integration of integrations) {
    const creds = (integration.credenciales as any) || null
    if (creds?.bot_token) tenants.add(integration.tenantId)
  }
  for (const channel of channels) {
    const config = (channel.config as any) || null
    if (config?.botToken) tenants.add(channel.tenantId)
  }
  return [...tenants]
}

/**
 * Resuelve a qué tenant corresponde un chat que ha escrito (o al que se le
 * envía algo).
 *
 * 1. Un solo tenant con vínculo → ese tenant.
 * 2. Varios tenants con vínculo → solo se acepta si la historia del chat
 *    (conversación previa) está en uno de ellos; si no, **no se resuelve**.
 * 3. Sin vínculo → si hay conversación previa, ese tenant.
 * 4. Sin vínculo ni historia → solo si exactamente UN tenant del sistema tiene
 *    bot propio (por eliminación no hay ambigüedad); con varios, **no se
 *    resuelve** hasta que el chat se vincule con `/start <tenantId>`.
 *
 * Devuelve `null` cuando no hay una respuesta segura: el webhook ignora el
 * mensaje en lugar de contestar con datos de otro tenant.
 */
export async function resolverContextoTelegram(chatId: string): Promise<ContextoTelegram | null> {
  try {
    const vinculos = await vinculosDelChat(chatId)
    const tenants = [...new Set(vinculos.map((v) => v.tenantId))]

    let tenantId: string | null = null

    if (tenants.length === 1) {
      tenantId = tenants[0]
    } else if (tenants.length > 1) {
      const conversacion = await tenantConversacion(chatId)
      tenantId = conversacion && tenants.includes(conversacion) ? conversacion : null
      if (!tenantId) {
        console.warn(
          `[TelegramResolver] Chat ${chatId} vinculado a ${tenants.length} tenants (${tenants.join(', ')}). ` +
            'Un chat pertenece a un solo tenant: vincula este chat con /start <tenantId> desde el tenant correcto.'
        )
        return null
      }
    } else {
      const conversacion = await tenantConversacion(chatId)
      if (conversacion) {
        tenantId = conversacion
      } else {
        const conBot = await tenantsConBotPropio()
        if (conBot.length === 1) {
          tenantId = conBot[0]
        } else if (conBot.length > 1) {
          console.warn(
            `[TelegramResolver] Chat ${chatId} sin vínculo ni historial y ${conBot.length} tenants con bot propio. ` +
              'Se ignora el mensaje hasta que el chat se vincule (/start <tenantId>).'
          )
        }
        // conBot.length === 0 → nadie puede contestar con bot propio
      }
    }

    if (!tenantId) return null

    const botToken = await tokenBotDelTenant(tenantId)
    if (!botToken) {
      console.warn(`[TelegramResolver] Tenant ${tenantId} sin bot propio; no se puede responder al chat ${chatId}`)
      return null
    }

    return { tenantId, botToken }
  } catch (error) {
    console.error('[TelegramResolver] Error resolviendo contexto:', error)
    return null
  }
}

/**
 * Guardia de envío: ¿este chat está vinculado únicamente a `tenantId`?
 * Si el chat está vinculado a otro tenant (o a varios), NO se debe enviar nada
 * desde `tenantId`: es la fuga que hacía llegar notificaciones de otros tenants
 * al mismo chat. Sin vínculos (cliente escribiendo por primera vez) se permite.
 */
export async function chatVinculadoSoloA(chatId: string, tenantId: string): Promise<boolean> {
  try {
    const vinculos = await vinculosDelChat(chatId)
    const tenants = new Set(vinculos.map((v) => v.tenantId))
    if (tenants.size === 0) return true
    return tenants.size === 1 && tenants.has(tenantId)
  } catch (error) {
    console.error('[TelegramResolver] Error comprobando vínculos del chat:', error)
    // Ante la duda no se envía: preferimos perder un aviso a filtrar datos.
    return false
  }
}

/**
 * Un chat = un tenant: desvincula `chatId` de todos los tenants salvo
 * `tenantIdAConservar` (integraciones, canales y usuarios). Se llama al
 * vincular con `/start` para que no queden dos tenants apuntando al mismo chat.
 */
export async function desvincularChatDeOtrosTenants(chatId: string, tenantIdAConservar: string): Promise<void> {
  try {
    const integrations = await prisma.integration.findMany({
      where: { tipo: 'telegram' },
      select: { id: true, tenantId: true, credenciales: true },
    })
    for (const integration of integrations) {
      if (integration.tenantId === tenantIdAConservar) continue
      const creds = (integration.credenciales as any) || null
      if (!creds || chatIdDe(creds.admin_chat_id) !== chatId) continue
      const sinVinculo = { ...creds, admin_chat_id: null }
      delete sinVinculo.admin_chat_vinculado_en
      await prisma.integration.update({
        where: { id: integration.id },
        data: { credenciales: sinVinculo },
      })
      console.warn(
        `[TelegramResolver] Chat ${chatId} desvinculado del tenant ${integration.tenantId} (un chat = un tenant)`
      )
    }

    const channels = await prisma.channel.findMany({
      where: { type: 'telegram' },
      select: { id: true, tenantId: true, config: true },
    })
    for (const channel of channels) {
      if (channel.tenantId === tenantIdAConservar) continue
      const config = (channel.config as any) || null
      if (!config) continue
      const enlazado = chatIdDe(config.adminChatId ?? config.admin_chat_id)
      if (enlazado !== chatId) continue
      const nuevo = { ...config }
      if ('adminChatId' in nuevo) nuevo.adminChatId = null
      if ('admin_chat_id' in nuevo) nuevo.admin_chat_id = null
      delete nuevo.adminChatVinculadoEn
      delete nuevo.admin_chat_vinculado_en
      await prisma.channel.update({ where: { id: channel.id }, data: { config: nuevo } })
      console.warn(
        `[TelegramResolver] Chat ${chatId} desvinculado del canal del tenant ${channel.tenantId} (un chat = un tenant)`
      )
    }

    const users = await prisma.user.findMany({
      where: {
        OR: [
          { metadata: { path: ['telegram_chat_id'], equals: chatId } },
          { metadata: { path: ['telegram', 'chat_id'], equals: chatId } },
        ],
      },
      select: { id: true, tenantId: true, metadata: true },
    })
    for (const user of users) {
      if (user.tenantId === tenantIdAConservar) continue
      const metadata = { ...((user.metadata as any) || {}) }
      delete metadata.telegram_chat_id
      if (metadata.telegram && chatIdDe(metadata.telegram.chat_id) === chatId) {
        metadata.telegram = { ...metadata.telegram, chat_id: null, linkedAt: null }
      }
      await prisma.user.update({ where: { id: user.id }, data: { metadata } })
      console.warn(
        `[TelegramResolver] Chat ${chatId} desvinculado del usuario ${user.id} del tenant ${user.tenantId} (un chat = un tenant)`
      )
    }
  } catch (error) {
    console.error('[TelegramResolver] Error desvinculando chat de otros tenants:', error)
  }
}

/**
 * Vincula `chatId` como admin_chat_id del tenant y lo desvincula del resto.
 * Devuelve false si el tenant no tiene integración ni canal de Telegram.
 */
export async function vincularChatComoAdmin(chatId: string, tenantId: string): Promise<boolean> {
  const integration = await prisma.integration.findFirst({
    where: { tenantId, tipo: 'telegram', activo: true },
    select: { id: true, credenciales: true },
  })
  if (integration) {
    const creds = (integration.credenciales as any) || {}
    await desvincularChatDeOtrosTenants(chatId, tenantId)
    await prisma.integration.update({
      where: { id: integration.id },
      data: {
        credenciales: {
          ...creds,
          admin_chat_id: chatId,
          // El panel muestra «vinculado desde…»: se sella al vincular (y al
          // volver a vincular, porque el vínculo es nuevo).
          admin_chat_vinculado_en: new Date().toISOString(),
        },
      },
    })
    return true
  }

  const channel = await prisma.channel.findFirst({
    where: { tenantId, type: 'telegram' },
    select: { id: true, config: true },
  })
  if (channel) {
    const config = (channel.config as any) || {}
    await desvincularChatDeOtrosTenants(chatId, tenantId)
    await prisma.channel.update({
      where: { id: channel.id },
      data: { config: { ...config, adminChatId: chatId, adminChatVinculadoEn: new Date().toISOString() } },
    })
    return true
  }

  return false
}
