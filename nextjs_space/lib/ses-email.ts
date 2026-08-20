import nodemailer from 'nodemailer';
import { prisma } from '@/lib/db';
import { getFromAddress, sendEmail as sendResendEmail } from './resend-email';

interface Attachment {
  filename: string;
  content: Buffer;
  contentType?: string;
}

interface SendEmailParams {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  from?: string;
  replyTo?: string;
  tenantSubdomain?: string;
  tenantId?: string;
  attachments?: Attachment[];
}

const tenantTransporterCache = new Map<string, nodemailer.Transporter>()

type TenantTransportResolution = {
  enabled: boolean
  transporter?: nodemailer.Transporter
  fromAddress?: string
  error?: string
}

function getTenantTransporterKey(tenantId: string, config: { host: string; port: number; user: string; password: string; encryption: string }): string {
  return `${tenantId}:${config.host}:${config.port}:${config.user}:${config.encryption}`
}

async function resolveTenantId(identifier?: string): Promise<string | undefined> {
  if (!identifier) return undefined

  try {
    const tenant = await prisma.tenant.findFirst({
      where: {
        OR: [
          { id: identifier },
          { subdomain: identifier },
          { slug: identifier },
        ],
      },
      select: { id: true },
    })
    return tenant?.id
  } catch {
    return undefined
  }
}

async function getTransporter(tenantId?: string): Promise<TenantTransportResolution> {
  if (!tenantId) return { enabled: false }

  try {
    const configs = await prisma.configuracion.findMany({
      where: { tenantId, clave: { in: ['smtp_host', 'smtp_port', 'smtp_user', 'smtp_password', 'smtp_encryption', 'smtp_from_email', 'smtp_from_name', 'smtp_enabled'] } },
    })

    const map = Object.fromEntries(configs.map(c => [c.clave, c.valor]))
    const enabled = String(map.smtp_enabled).toLowerCase() === 'true'
    if (!enabled) return { enabled: false }

    if (!map.smtp_host || !map.smtp_user || !map.smtp_password) {
      return { enabled: true, error: 'El SMTP del tenant está habilitado pero incompleto' }
    }

    const host = map.smtp_host
    const port = parseInt(map.smtp_port) || 587
    const secure = map.smtp_encryption === 'ssl'
    const cacheKey = getTenantTransporterKey(tenantId, { host, port, user: map.smtp_user, password: map.smtp_password, encryption: map.smtp_encryption || 'tls' })

    if (!tenantTransporterCache.has(cacheKey)) {
      const t = nodemailer.createTransport({
        host,
        port,
        secure,
        auth: { user: map.smtp_user, pass: map.smtp_password },
        tls: { rejectUnauthorized: false },
      })
      tenantTransporterCache.set(cacheKey, t)
    }

    const fromName = map.smtp_from_name
    const fromEmail = map.smtp_from_email || map.smtp_user
    const fromAddress = fromName ? `"${fromName}" <${fromEmail}>` : fromEmail

    return { enabled: true, transporter: tenantTransporterCache.get(cacheKey)!, fromAddress }
  } catch {
    // Si no se puede consultar la configuración, no afirmamos que SMTP esté activo.
    return { enabled: false }
  }
}

export async function sendEmail({
  to,
  subject,
  html,
  text,
  from,
  replyTo,
  tenantSubdomain,
  tenantId,
  attachments,
}: SendEmailParams) {
  let tenantSmtpConfigured = false

  try {
    // Algunos avisos antiguos entregan el identificador como tenantSubdomain.
    // Resolver ambos formatos mantiene la prioridad SMTP del tenant en todo el
    // sistema sin depender del proveedor global.
    const smtpTenantId = tenantId || await resolveTenantId(tenantSubdomain)
    const tenantTransport = await getTransporter(smtpTenantId)
    tenantSmtpConfigured = tenantTransport.enabled

    // El SMTP habilitado por el tenant tiene prioridad absoluta. No se debe
    // cambiar silenciosamente a Resend si falla.
    if (tenantTransport.error) {
      return {
        success: false,
        error: tenantTransport.error,
        tenantSmtpConfigured,
      }
    }

    // Sin SMTP del tenant configurado, todos los envíos salen por Resend.
    if (!tenantTransport.transporter) {
      const result = await sendResendEmail({
        to,
        subject,
        html,
        text,
        from: from || getFromAddress(tenantSubdomain),
        replyTo,
      })
      return { ...result, tenantSmtpConfigured }
    }

    const transporter = tenantTransport.transporter
    const fromAddress = from || tenantTransport.fromAddress || getFromAddress(tenantSubdomain)

    const info = await transporter.sendMail({
      from: fromAddress,
      to: Array.isArray(to) ? to.join(', ') : to,
      subject,
      text,
      html,
      replyTo,
      attachments,
      headers: {
        'X-VOLKERN-TENANT': tenantSubdomain || tenantId || 'default',
      },
    })

    console.log(`[Email] Email enviado (SMTP tenant):`, info.messageId)

    return {
      success: true,
      messageId: info.messageId,
      data: info,
      tenantSmtpConfigured,
    }
  } catch (error: any) {
    console.error('[Email] Error enviando email:', error)
    return {
      success: false,
      error: error.message,
      tenantSmtpConfigured,
    }
  }
}

export async function sendBulkEmail(emails: SendEmailParams[]) {
  try {
    const results = await Promise.allSettled(
      emails.map(email => sendEmail(email))
    )

    return {
      success: true,
      results: results.map((result, index) => ({
        to: emails[index].to,
        status: result.status,
        data: result.status === 'fulfilled' ? result.value : null,
        error: result.status === 'rejected' ? result.reason : null,
      })),
    }
  } catch (error: any) {
    console.error('[Email] Error en envío masivo:', error)
    return {
      success: false,
      error: error.message,
    }
  }
}

export function replaceTemplateVariables(
  template: string,
  variables: Record<string, string>
): string {
  let result = template

  Object.entries(variables).forEach(([key, value]) => {
    const regex = new RegExp(`\\{${key}\\}`, 'g')
    result = result.replace(regex, value)
  })

  return result
}