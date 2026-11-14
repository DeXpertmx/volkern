/**
 * Registro del webhook de Telegram de un tenant.
 *
 * Todos los bots apuntan al mismo endpoint (`/api/webhooks/telegram`), pero
 * **cada bot tenía que registrarse a mano** con
 * `scripts/register-telegram-webhooks.ts`: al conectar un bot desde el panel se
 * guardaba el token en `Channel`/`Integration` sin decirle nada a Telegram, así
 * que el bot no recibía ningún mensaje. Desde fuera parecía que el chat «no
 * funcionaba» cuando en realidad nunca llegaba nada al servidor.
 *
 * Aquí se registra al conectar/actualizar el bot (onboarding, integraciones y
 * alta desde el panel de superadmin), se verifica y se puede reparar desde la
 * pantalla de Integraciones.
 *
 * El `secret_token` se deriva del token del bot (ver `webhook-secret`), de modo
 * que la cabecera `X-Telegram-Bot-Api-Secret-Token` identifica al tenant sin
 * guardar nada nuevo en la base de datos.
 */
import { secretTokenDelBot } from './webhook-secret'

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || 'https://volkern.app').replace(/\/+$/, '')

/** URL a la que deben apuntar todos los bots de tenant. */
export const URL_WEBHOOK_TELEGRAM = `${APP_URL}/api/webhooks/telegram`

const ALLOWED_UPDATES = ['message', 'edited_message', 'callback_query']

export interface RegistroWebhook {
  ok: boolean
  /** URL que debe tener el bot. */
  url: string
  /** Explicación legible del resultado. */
  descripcion?: string
  /** El bot apunta a otra URL y no se ha tocado (usar `forzar`). */
  conflicto?: boolean
}

export interface EstadoWebhook {
  registrado: boolean
  url: string | null
  esperada: string
  pendientes: number
  ultimoError: string | null
  ultimoErrorEn: string | null
}

async function telegram(botToken: string, metodo: string, body?: unknown): Promise<any> {
  const res = await fetch(`https://api.telegram.org/bot${botToken}/${metodo}`, {
    method: body ? 'POST' : 'GET',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(8000),
  })
  return res.json().catch(() => ({}))
}

/**
 * Registra (o repara) el webhook del bot para que entregue los updates al
 * pipeline unificado, con el secret del tenant.
 *
 * Por defecto **no pisa** un webhook que apunte a otro sitio: si el bot lo usa
 * otra aplicación, se devuelve `conflicto` y decide el usuario desde el panel.
 */
export async function registrarWebhookBot(
  botToken: string,
  opciones: { url?: string; forzar?: boolean } = {}
): Promise<RegistroWebhook> {
  const url = opciones.url || URL_WEBHOOK_TELEGRAM
  if (!botToken) return { ok: false, url, descripcion: 'El tenant no tiene token de bot' }

  try {
    if (!opciones.forzar) {
      const info = await telegram(botToken, 'getWebhookInfo')
      const actual = String(info?.result?.url || '')
      if (actual && actual !== url) {
        return {
          ok: false,
          url,
          conflicto: true,
          descripcion: `El bot ya apunta a ${actual}; no se ha cambiado`,
        }
      }
    }

    const alta = await telegram(botToken, 'setWebhook', {
      url,
      secret_token: secretTokenDelBot(botToken),
      allowed_updates: ALLOWED_UPDATES,
    })
    if (!alta?.ok) {
      return { ok: false, url, descripcion: alta?.description || 'Telegram rechazó setWebhook' }
    }

    // Telegram propaga el cambio en un instante: se confirma la URL resultante.
    await new Promise((resolve) => setTimeout(resolve, 500))
    const verificacion = await telegram(botToken, 'getWebhookInfo')
    const finalUrl = String(verificacion?.result?.url || '')
    if (finalUrl !== url) {
      return {
        ok: false,
        url,
        descripcion: `Telegram devolvió «${finalUrl || 'sin webhook'}» en lugar de la URL esperada`,
      }
    }

    return { ok: true, url, descripcion: 'Webhook registrado' }
  } catch (error) {
    return {
      ok: false,
      url,
      descripcion: error instanceof Error ? error.message : 'Error desconocido registrando el webhook',
    }
  }
}

/** Estado actual del webhook del bot, para mostrarlo en Integraciones. */
export async function estadoWebhookBot(botToken: string): Promise<EstadoWebhook> {
  const esperada = URL_WEBHOOK_TELEGRAM
  if (!botToken) {
    return { registrado: false, url: null, esperada, pendientes: 0, ultimoError: 'Sin token de bot', ultimoErrorEn: null }
  }
  try {
    const info = await telegram(botToken, 'getWebhookInfo')
    const result = info?.result || {}
    const url = String(result.url || '') || null
    return {
      registrado: url === esperada,
      url,
      esperada,
      pendientes: Number(result.pending_update_count || 0),
      ultimoError: result.last_error_message || null,
      ultimoErrorEn: result.last_error_date ? new Date(result.last_error_date * 1000).toISOString() : null,
    }
  } catch (error) {
    return {
      registrado: false,
      url: null,
      esperada,
      pendientes: 0,
      ultimoError: error instanceof Error ? error.message : 'Error consultando Telegram',
      ultimoErrorEn: null,
    }
  }
}
