
// Email via Resend — Multi-tenant
// Cada tenant puede tener su propio subdominio verificado
// y los emails se envían desde noreply@{subdomain}.volkern.app

interface ResendCredentials {
  api_key: string
}

let credentials: ResendCredentials | null = null

// Dominio raíz para subdominios de tenants
const ROOT_EMAIL_DOMAIN = 'volkern.app'

// Cargar credenciales desde variables de entorno
function loadCredentials(): ResendCredentials {
  if (credentials) return credentials

  const envApiKey = process.env.RESEND_API_KEY
  
  if (!envApiKey) {
    throw new Error('Resend credentials not configured. Set RESEND_API_KEY environment variable.')
  }

  credentials = { api_key: envApiKey }
  return credentials
}

// ─── Helpers de direcciones ────────────────────────────────

/**
 * Obtiene la dirección FROM para un tenant.
 * Ejemplo: "DeXpert <noreply@volkern.app>"
 *
 * El NOMBRE visible se personaliza con el tenant, pero el DOMINIO siempre
 * es el dominio verificado en Resend. Resend valida dominios exactos:
 * enviar desde noreply@{subdominio}.volkern.app falla con 403 mientras
 * ese subdominio no esté verificado explícitamente en resend.com/domains.
 *
 * Para habilitar envíos desde un subdominio propio del tenant:
 * 1. Verificar el dominio exacto en Resend (DNS DKIM/SPF).
 * 2. Añadirlo a RESEND_VERIFIED_DOMAINS (separado por comas), p. ej.:
 *    RESEND_VERIFIED_DOMAINS=volkern.app,dexpert.volkern.app
 */
const VERIFIED_DOMAINS_ENV = () =>
  (process.env.RESEND_VERIFIED_DOMAINS || '')
    .split(',')
    .map(d => d.trim().toLowerCase())
    .filter(Boolean)

export function getFromAddress(tenantSubdomain?: string, tenantName?: string): string {
  const displayName = tenantName?.trim() || 'Volkern'

  // Dominio por subdominio SOLO si el operador lo declaró verificado
  if (tenantSubdomain && VERIFIED_DOMAINS_ENV().includes(`${tenantSubdomain}.${ROOT_EMAIL_DOMAIN}`)) {
    return `${displayName} <noreply@${tenantSubdomain}.${ROOT_EMAIL_DOMAIN}>`
  }

  return `${displayName} <noreply@${ROOT_EMAIL_DOMAIN}>`
}

interface SendEmailParams {
  to: string | string[]
  subject: string
  html?: string
  text?: string
  from?: string
  replyTo?: string
  tenantSubdomain?: string  // Subdominio del tenant para construir from dinámico
  tenantName?: string       // Nombre del tenant para el from
}

export async function sendEmail({
  to,
  subject,
  html,
  text,
  from,
  replyTo,
  tenantSubdomain,
  tenantName,
}: SendEmailParams) {
  // Si no se especifica from explícitamente, usar dinámico por tenant
  const fromAddress = from || getFromAddress(tenantSubdomain, tenantName)
  
  try {
    const creds = loadCredentials()
    
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${creds.api_key}`,
      },
      body: JSON.stringify({
        from: fromAddress,
        to: Array.isArray(to) ? to : [to],
        subject,
        html,
        text,
        reply_to: replyTo,
      }),
    })

    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(`Resend API error: ${response.status} - ${JSON.stringify(errorData)}`)
    }

    const result = await response.json()
    return {
      success: true,
      messageId: result.id,
      data: result,
    }
  } catch (error: any) {
    console.error('Error sending email:', error)
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
    console.error('Error sending bulk emails:', error)
    return {
      success: false,
      error: error.message,
    }
  }
}

// Función para reemplazar variables en templates
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
