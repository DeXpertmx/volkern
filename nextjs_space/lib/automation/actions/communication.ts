import { ActionContext } from '../types'
import { replaceVariables } from '../variables-parser'
import { sendEmail as sendSESEmail } from '@/lib/ses-email'
import { sendSMS as sendTwilioSMS } from '@/lib/sms'
import { sendWhatsAppMessage } from '@/lib/whatsapp'
import { sendTelegramMessage, loadTelegramCredentials } from '@/lib/telegram'
import { notificationService } from '@/lib/skills/notification-layer'
import { createSystemContext } from '@/lib/skills/context'

export async function sendEmail(config: any, ctx: ActionContext, attempt = 1): Promise<boolean> {
  const { subject, message, maxRetries = 2 } = config
  const contacto = ctx.state.lead || ctx.state.estudiante

  if (!contacto?.email) return false

  const processedMessage = replaceVariables(message, ctx.state)
  const processedSubject = replaceVariables(subject, ctx.state)

  try {
    await sendSESEmail({
      to: contacto.email,
      subject: processedSubject,
      html: processedMessage,
      // Pasar tenantId (no tenantSubdomain): ses-email resuelve el SMTP del
      // tenant con este id y, si no hay SMTP, el remitente de Resend cae al
      // dominio raíz verificado (noreply@volkern.app) en vez de construir un
      // subdominio por tenant no verificado que Resend rechaza con 403.
      tenantId: ctx.state.tenantId,
    })
    return true
  } catch (error) {
    console.error(`Error enviando email (intento ${attempt}/${maxRetries + 1}):`, error)
    if (attempt <= maxRetries) {
      await new Promise(r => setTimeout(r, 1000 * attempt))
      return sendEmail(config, ctx, attempt + 1)
    }
    return false
  }
}

export async function sendSMS(config: any, ctx: ActionContext, attempt = 1): Promise<boolean> {
  const { message, maxRetries = 2 } = config
  const contacto = ctx.state.lead || ctx.state.estudiante

  if (!contacto?.telefono) return false

  const processedMessage = replaceVariables(message, ctx.state)

  try {
    await sendTwilioSMS(contacto.telefono, processedMessage)
    return true
  } catch (error) {
    console.error(`Error enviando SMS (intento ${attempt}/${maxRetries + 1}):`, error)
    if (attempt <= maxRetries) {
      await new Promise(r => setTimeout(r, 1000 * attempt))
      return sendSMS(config, ctx, attempt + 1)
    }
    return false
  }
}

export async function sendWhatsApp(config: any, ctx: ActionContext, attempt = 1): Promise<boolean> {
  const { message, maxRetries = 2 } = config
  const contacto = ctx.state.lead || ctx.state.estudiante

  if (!contacto?.telefono) return false
  if (!ctx.state.tenantId) {
    console.error('Error: No se proporcionó tenantId en el contexto de automatización')
    return false
  }

  const processedMessage = replaceVariables(message, ctx.state)

  try {
    await sendWhatsAppMessage(contacto.telefono, processedMessage, ctx.state.tenantId)
    return true
  } catch (error) {
    console.error(`Error enviando WhatsApp (intento ${attempt}/${maxRetries + 1}):`, error)
    if (attempt <= maxRetries) {
      await new Promise(r => setTimeout(r, 1000 * attempt))
      return sendWhatsApp(config, ctx, attempt + 1)
    }
    return false
  }
}

export async function sendTelegram(config: any, ctx: ActionContext, attempt = 1): Promise<boolean> {
  const { message, chatId, maxRetries = 2 } = config
  const tenantId = ctx.state.tenantId

  if (!tenantId) {
    console.error('[Automation] No tenantId in context for sendTelegram')
    return false
  }

  const processedMessage = replaceVariables(message, ctx.state)

  try {
    const creds = await loadTelegramCredentials(tenantId)
    // Solo el bot PROPIO del tenant: sin él no se envía (el bot del sistema
    // no lleva datos de tenants).
    if (!creds?.bot_token) {
      console.error('[Automation] El tenant no tiene bot de Telegram propio; no se envía')
      return false
    }
    const finalChatId = chatId || creds.admin_chat_id
    if (!finalChatId) {
      console.error('[Automation] No chatId provided for sendTelegram')
      return false
    }
    await sendTelegramMessage(finalChatId, processedMessage, creds.bot_token)
    return true
  } catch (error) {
    console.error(`Error enviando Telegram (intento ${attempt}/${maxRetries + 1}):`, error)
    if (attempt <= maxRetries) {
      await new Promise(r => setTimeout(r, 1000 * attempt))
      return sendTelegram(config, ctx, attempt + 1)
    }
    return false
  }
}

export async function sendNotification(config: any, ctx: ActionContext): Promise<boolean> {
  const { message, userId, priority = 'normal' } = config
  const tenantId = ctx.state.tenantId || ctx.state.lead?.tenantId

  if (!tenantId) return false

  const processedMessage = replaceVariables(message, ctx.state)
  const context = createSystemContext(tenantId)

  try {
    await notificationService.send(
      { type: 'user', id: userId || 'admin' },
      { title: 'Notificación de Automatización', body: processedMessage },
      { channel: 'in_app', priority: priority as any },
      context
    )
    return true
  } catch (error) {
    console.error('Error en sendNotification de automatización:', error)
    return false
  }
}
