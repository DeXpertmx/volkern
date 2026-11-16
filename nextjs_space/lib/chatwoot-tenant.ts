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
 * Solo sirve el token de agente del canal (`config.apiToken`): el token del
 * hub (`messagingHubConfig.hubApiToken`) pertenece al usuario bot y Chatwoot
 * rechaza con 401 "Access to this endpoint is not authorized for bots" al
 * crear conversaciones o enviar mensajes. Si no hay token de agente se
 * devuelve cadena vacía y el llamador cae a Evolution sin intentar el hub.
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
  return cfg.apiToken || ''
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
}): Promise<{ success: boolean; messageId?: number; error?: string }> {
  const bridge = chatwootBridgeDe(params.conversacion)
  if (!bridge) {
    return { success: false, error: 'La conversación no está vinculada a Chatwoot' }
  }

  try {
    const token = await obtenerTokenChatwootTenant(params.tenantId, bridge.accountId)
    if (!token) {
      return { success: false, error: 'El hub no tiene token de API configurado' }
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
    return { success: false, error: error?.message || 'Error enviando por Chatwoot' }
  }
}
