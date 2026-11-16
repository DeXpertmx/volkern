/**
 * Aviso por Telegram cuando Evolution informa de una desconexión de WhatsApp
 * (`connection.update` con estado close/disconnected).
 *
 * Por qué existe: la instancia del negocio puede caerse sin que nadie lo note
 * hasta que un agente intenta enviar y falla. El webhook ya recibe el evento,
 * así que el aviso sale en el momento.
 *
 * Va al chat del desarrollador (`TELEGRAM_ADMIN_CHAT_ID`) con el bot del
 * sistema, igual que el resto de alertas de infraestructura. Dedupe de 6 h por
 * instancia: Evolution repite `connection.update` en cada reintento y no
 * queremos una tormenta de mensajes.
 */

import { sendTelegramMessage } from '@/lib/telegram'
import { initRedis } from '@/lib/core/redis'

const DEDUPE_TTL_SECONDS = 6 * 3600

// Fallback en memoria (una sola instancia, sin Redis)
const avisados = new Map<string, number>()

export interface InstanciaCaidaInfo {
  instanceName: string
  /** 'tenant' = WhatsApp del negocio, 'user' = personal, 'platform' = número oficial */
  tipo: 'tenant' | 'user' | 'platform'
  tenantId?: string | null
  telefono?: string | null
  /** Estado crudo que mandó Evolution (close, disconnected...) */
  motivo?: string | null
}

const TIPO_LABEL: Record<InstanciaCaidaInfo['tipo'], string> = {
  tenant: 'WhatsApp del negocio',
  user: 'WhatsApp personal de un usuario',
  platform: 'número oficial de la plataforma',
}

async function yaAvisado(instanceName: string): Promise<boolean> {
  const key = `whatsapp:down:alerted:${instanceName}`
  const redis = await initRedis()
  if (redis) {
    try {
      const creado = await redis.set(key, '1', 'EX', DEDUPE_TTL_SECONDS, 'NX')
      return creado === null
    } catch (error) {
      console.warn('[WhatsAppDown] Redis falló, se usa memoria:', (error as Error).message)
    }
  }
  const visto = avisados.get(key)
  if (visto && Date.now() - visto < DEDUPE_TTL_SECONDS * 1000) return true
  avisados.set(key, Date.now())
  return false
}

/**
 * Notifica la caída. Nunca lanza: el webhook de Evolution debe responder 200
 * aunque Telegram falle (si no, Evolution reintenta el evento en bucle).
 */
export async function notificarWhatsAppDesconectado(info: InstanciaCaidaInfo): Promise<void> {
  try {
    const chat = process.env.TELEGRAM_ADMIN_CHAT_ID
    if (!chat) {
      console.warn('[WhatsAppDown] TELEGRAM_ADMIN_CHAT_ID no configurado; no se envió el aviso.');
      return
    }

    if (await yaAvisado(info.instanceName)) {
      console.log('[WhatsAppDown] Aviso ya enviado hace poco para', info.instanceName)
      return
    }

    const lineas = [
      '🔴 WhatsApp desconectado',
      '',
      `Instancia: ${info.instanceName}`,
      `Servicio: ${TIPO_LABEL[info.tipo]}`,
    ]
    if (info.tenantId) lineas.push(`Tenant: ${info.tenantId}`)
    if (info.telefono) lineas.push(`Número: ${info.telefono}`)
    if (info.motivo) lineas.push(`Estado Evolution: ${info.motivo}`)
    lineas.push(`Hora: ${new Date().toISOString()}`)
    lineas.push('')
    lineas.push(
      info.tipo === 'platform'
        ? 'El número oficial no emitirá notificaciones hasta que se reconecte (admin → WhatsApp de plataforma).'
        : 'Los envíos salientes por este número fallarán hasta que se reconecte: Configuración → WhatsApp del Negocio → Reconectar (mostrar QR).'
    )

    const res = await sendTelegramMessage(chat, lineas.join('\n'))
    if (!res.success) {
      console.error('[WhatsAppDown] Error enviando el aviso:', res.error)
    }
  } catch (error) {
    console.error('[WhatsAppDown] Excepción enviando el aviso:', error)
  }
}
