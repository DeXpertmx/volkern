/**
 * Utilidades del puente Chatwoot (Hub de Comunicaciones) para envíos salientes.
 *
 * El inbox de WhatsApp del hub es el que tiene la instancia de Evolution
 * conectada; la instancia directa del tenant (TenantWhatsAppInstance) puede
 * estar desconectada. Por eso los envíos salientes priorizan Chatwoot y solo
 * caen a Evolution si el hub no está disponible.
 */

import { prisma } from '@/lib/db'
import { chatwootApi } from '@/lib/nexus/chatwoot-api'

/**
 * Token de AGENTE de la cuenta de Chatwoot.
 *
 * Nunca se usa `messagingHubConfig.hubApiToken`: pertenece al usuario bot y
 * Chatwoot responde 401 ("not authorized for bots") al crear conversaciones o
 * enviar mensajes. Se resuelve, por orden:
 *   1. `channel.config.apiToken` (token de agente guardado con el canal).
 *   2. `messagingHubConfig.chatwootAgentToken` (Configuración → Hub).
 * Si no hay ninguno se devuelve cadena vacía y el llamador cae a Evolution sin
 * intentar el hub.
 */
export async function obtenerTokenChatwootTenant(
  tenantId: string,
  _accountId: number
): Promise<string> {
  const canal = await prisma.channel.findFirst({
    where: { tenantId, type: 'whatsapp', isActive: true },
    select: { config: true },
  })
  const cfg: any = canal?.config || {}
  if (cfg.apiToken) return cfg.apiToken

  const hub = await prisma.messagingHubConfig.findUnique({
    where: { tenantId },
    select: { chatwootAgentToken: true },
  })
  const guardado = hub?.chatwootAgentToken
  if (!guardado) return ''

  try {
    const { decrypt } = await import('@/lib/core/crypto')
    return decrypt(guardado)
  } catch {
    return guardado
  }
}

/**
 * ¿El error del hub deja en el aire si el mensaje llegó a salir?
 *
 * Un 4xx de Chatwoot (salvo 408/429) es un rechazo explícito: no se envió
 * nada y se puede caer a Evolution. Un timeout, un fallo de red o un 5xx no
 * permiten saberlo, así que el llamador NO debe reenviar a ciegas: primero
 * comprueba si el mensaje existe en la conversación del hub.
 */
export function errorHubAmbiguo(error: any): boolean {
  const texto = String(error?.message || error || '')
  const status = texto.match(/Chatwoot API error:\s*(\d{3})/i)?.[1]
  if (status) {
    const code = Number(status)
    if (code >= 400 && code < 500 && code !== 408 && code !== 429) return false
    return true
  }
  return true
}

/**
 * Devuelve la cuenta y conversación de Chatwoot a las que está puenteada una
 * conversación local, o null si no lo está. Acepta tanto el formato moderno
 * (`hubMetadata.chatwootConversationId`) como el legacy (`externalRef`).
 */
export function chatwootBridgeDe(
  conversacion: any
): { accountId: number; convId: number } | null {
  if (!conversacion?.chatwootAccountId) return null

  const deMetadata = (conversacion.hubMetadata as any)?.chatwootConversationId
  const deExternalRef =
    typeof conversacion.externalRef === 'string' && conversacion.externalRef.startsWith('chatwoot_')
      ? Number(conversacion.externalRef.replace('chatwoot_', ''))
      : null
  const convId = Number(deMetadata || deExternalRef)

  if (!Number.isFinite(convId) || !convId) return null
  return { accountId: Number(conversacion.chatwootAccountId), convId }
}

/** Envía un texto por la conversación puenteada de Chatwoot. */
export async function enviarWhatsAppPorChatwoot(params: {
  tenantId: string
  conversacion: any
  contenido: string
}): Promise<{ success: boolean; messageId?: number; error?: string; ambiguo?: boolean }> {
  const bridge = chatwootBridgeDe(params.conversacion)
  if (!bridge) {
    return { success: false, error: 'La conversación no está vinculada a Chatwoot', ambiguo: false }
  }

  try {
    const token = await obtenerTokenChatwootTenant(params.tenantId, bridge.accountId)
    if (!token) {
      return { success: false, error: 'El hub no tiene token de API configurado', ambiguo: false }
    }
    const respuesta = await chatwootApi.sendMessage(
      bridge.accountId,
      bridge.convId,
      params.contenido,
      token,
      { messageType: 'outgoing', contentAttributes: { volkernOrigin: 'app' } }
    )
    return { success: true, messageId: respuesta.id }
  } catch (error: any) {
    return {
      success: false,
      error: error?.message || 'Error enviando por Chatwoot',
      ambiguo: errorHubAmbiguo(error),
    }
  }
}

/**
 * Busca en la conversación del hub un mensaje saliente con el mismo texto.
 *
 * Se usa cuando el envío por Chatwoot terminó de forma ambigua (timeout/red):
 * si el mensaje está allí, salió y no hay que reenviarlo por Evolution.
 * Devuelve `encontrado: false` también si no se pudo comprobar: en ese caso el
 * llamador debe tratarlo como "sin confirmar", nunca como fallo seguro.
 */
export async function buscarMensajeEnChatwoot(params: {
  tenantId: string
  conversacion: any
  contenido: string
  desde?: Date
}): Promise<{ encontrado: boolean; messageId?: number }> {
  const bridge = chatwootBridgeDe(params.conversacion)
  if (!bridge) return { encontrado: false }

  try {
    const token = await obtenerTokenChatwootTenant(params.tenantId, bridge.accountId)
    if (!token) return { encontrado: false }

    const respuesta: any = await chatwootApi.getConversationMessages(
      bridge.accountId,
      bridge.convId,
      token
    )
    const lista: any[] = Array.isArray(respuesta?.payload)
      ? respuesta.payload
      : Array.isArray(respuesta)
        ? respuesta
        : []

    const objetivo = params.contenido.trim()
    const desdeMs = (params.desde?.getTime() ?? 0) - 120_000

    const encontrado = lista.find((m) => {
      // message_type 1 = saliente en Chatwoot
      if (Number(m?.message_type) !== 1) return false
      if (String(m?.content ?? '').trim() !== objetivo) return false
      const creado = Number(m?.created_at) * 1000
      return Number.isFinite(creado) ? creado >= desdeMs : true
    })

    return encontrado
      ? { encontrado: true, messageId: Number(encontrado.id) }
      : { encontrado: false }
  } catch (error) {
    console.warn('[chatwoot-tenant] No se pudo verificar el mensaje en el hub:', error)
    return { encontrado: false }
  }
}
