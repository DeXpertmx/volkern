import { ImapFlow } from 'imapflow';
import { prisma } from '@/lib/db';
import { simpleParser } from 'mailparser';

interface SmtpConfig {
  host: string
  port: number
  user: string
  password: string
  encryption: string
  catchall: string
  enabled: boolean
}

async function getImapConfig(tenantId: string): Promise<SmtpConfig | null> {
  const keys = await prisma.configuracion.findMany({
    where: { tenantId, clave: { in: ['imap_host', 'imap_port', 'imap_user', 'imap_password', 'imap_encryption', 'imap_catchall', 'imap_enabled'] } },
  })
  const m = Object.fromEntries(keys.map(c => [c.clave, c.valor]))
  if (m.imap_enabled !== 'true') return null
  if (!m.imap_host || !m.imap_user || !m.imap_password) return null
  return {
    host: m.imap_host,
    port: parseInt(m.imap_port) || (m.imap_encryption === 'ssl' ? 993 : 143),
    user: m.imap_user,
    password: m.imap_password,
    encryption: m.imap_encryption || 'ssl',
    catchall: m.imap_catchall || '',
    enabled: true,
  }
}

function extractEmailAddress(raw: string): string | null {
  const match = raw.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/)
  return match ? match[0].toLowerCase() : null
}

async function matchEmailToLeadOrContact(tenantId: string, fromEmail: string): Promise<{ leadId?: string; contactId?: string } | null> {
  const lead = await prisma.lead.findFirst({
    where: { tenantId, email: { equals: fromEmail, mode: 'insensitive' } },
    select: { id: true },
  })
  if (lead) return { leadId: lead.id }

  const contact = await prisma.contact.findFirst({
    where: { tenantId, email: { equals: fromEmail, mode: 'insensitive' } },
    select: { id: true },
  })
  if (contact) return { contactId: contact.id }

  return null
}

async function processEmail(tenantId: string, cfg: SmtpConfig) {
  const client = new ImapFlow({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.encryption === 'ssl',
    auth: { user: cfg.user, pass: cfg.password },
    logger: false,
  })

  try {
    await client.connect()
    const lock = await client.getMailboxLock('INBOX')
    try {
      const messages = await client.search({ unseen: true })
      if (messages.length === 0) return

      for (const seq of messages) {
        try {
          const msg = await client.fetchOne(seq, { source: true, envelope: true })
          const parsed = await simpleParser(msg.source)

          const fromEmail = extractEmailAddress(parsed.from?.text || '')
          if (!fromEmail) continue

          const subject = parsed.subject || '(Sin asunto)'
          const textBody = parsed.text || parsed.html || ''
          const date = parsed.date || new Date()

          // Intentar match con lead o contacto
          const match = await matchEmailToLeadOrContact(tenantId, fromEmail)
          if (!match) continue

          const contenido = `📩 Email recibido de ${fromEmail}\nAsunto: ${subject}\n\n${textBody.substring(0, 2000)}`

          await prisma.interaction.create({
            data: {
              leadId: match.leadId || null,
              contactId: match.contactId || null,
              tipo: 'email',
              contenido,
              resultado: 'neutro',
              metadatos: {
                direccion: fromEmail,
                asunto: subject,
                fechaOriginal: date.toISOString(),
                origen: 'imap',
                catchall: cfg.catchall || null,
              },
              fechaCreacion: date,
            },
          })

          await client.messageFlagsAdd(seq, ['\\Seen'])
          console.log(`[IMAP] Email procesado de ${fromEmail} — asunto: ${subject}`)
        } catch (msgErr) {
          console.error('[IMAP] Error procesando mensaje individual:', msgErr)
        }
      }
    } finally {
      lock.release()
    }
  } catch (err) {
    console.error(`[IMAP] Error en polling para tenant ${tenantId}:`, err)
  } finally {
    try { await client.logout() } catch { /* ignore */ }
  }
}

export async function pollAllTenants() {
  console.log('[IMAP] Iniciando polling para todos los tenants...')

  const tenants = await prisma.tenant.findMany({
    where: { plan: { not: null } },
    select: { id: true },
  })

  for (const tenant of tenants) {
    const cfg = await getImapConfig(tenant.id)
    if (!cfg) continue
    await processEmail(tenant.id, cfg)
  }

  console.log('[IMAP] Polling completado')
}

export async function pollTenant(tenantId: string) {
  const cfg = await getImapConfig(tenantId)
  if (!cfg) return
  await processEmail(tenantId, cfg)
}
