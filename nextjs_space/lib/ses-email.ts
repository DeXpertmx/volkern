import nodemailer from 'nodemailer';
import { prisma } from '@/lib/db';

const FROM_ADDRESSES: Record<string, string> = {
  admin: 'Volkern <noreply@volkern.app>',
  demo: 'Volkern <noreply@volkern.app>',
  default: process.env.EMAIL_FROM || 'Volkern <noreply@volkern.app>'
};

const defaultTransporter = nodemailer.createTransport({
  host: `email-smtp.${process.env.AWS_SES_REGION || 'eu-north-1'}.amazonaws.com`,
  port: 587,
  secure: false,
  auth: {
    user: process.env.AWS_SES_USER,
    pass: process.env.AWS_SES_PASSWORD,
  },
});

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

function getTenantTransporterKey(tenantId: string, config: { host: string; port: number; user: string; password: string; encryption: string }): string {
  return `${tenantId}:${config.host}:${config.port}:${config.user}:${config.encryption}`
}

async function getTransporter(tenantId?: string): Promise<{ transporter: nodemailer.Transporter; fromAddress: string } | null> {
  if (!tenantId) return null

  try {
    const configs = await prisma.configuracion.findMany({
      where: { tenantId, clave: { in: ['smtp_host', 'smtp_port', 'smtp_user', 'smtp_password', 'smtp_encryption', 'smtp_from_email', 'smtp_from_name', 'smtp_enabled'] } },
    })

    const map = Object.fromEntries(configs.map(c => [c.clave, c.valor]))
    if (map.smtp_enabled !== 'true') return null
    if (!map.smtp_host || !map.smtp_user || !map.smtp_password) return null

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

    return { transporter: tenantTransporterCache.get(cacheKey)!, fromAddress }
  } catch {
    return null
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
  try {
    const tenantTransport = await getTransporter(tenantId)
    const transporter = tenantTransport?.transporter || defaultTransporter
    const fromAddress = from || tenantTransport?.fromAddress || getFromAddress(tenantSubdomain)

    const info = await transporter.sendMail({
      from: fromAddress,
      to: Array.isArray(to) ? to.join(', ') : to,
      subject,
      text,
      html,
      replyTo,
      attachments,
      headers: {
        'X-SES-TENANT': tenantSubdomain || tenantId || 'default',
      },
    })

    console.log(`[SES] Email enviado${tenantTransport ? ' (SMTP tenant)' : ''}:`, info.messageId)

    return {
      success: true,
      messageId: info.messageId,
      data: info,
    }
  } catch (error: any) {
    console.error('[SES] Error enviando email:', error)
    return {
      success: false,
      error: error.message,
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
    console.error('[SES] Error en envío masivo:', error)
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
