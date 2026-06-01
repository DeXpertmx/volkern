
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
 * Obtiene la dirección FROM para un tenant basado en su subdominio.
 * Ejemplo: "DeXpert <noreply@dexpert.volkern.app>"
 * 
 * AHORA es dinámico: construye la dirección a partir del subdominio del tenant
 * en lugar de usar un mapeo estático.
 */
export function getFromAddress(tenantSubdomain?: string, tenantName?: string): string {
  if (tenantSubdomain && tenantName) {
    return `${tenantName} <noreply@${tenantSubdomain}.${ROOT_EMAIL_DOMAIN}>`
  }
  if (tenantSubdomain) {
    return `Volkern <noreply@${tenantSubdomain}.${ROOT_EMAIL_DOMAIN}>`
  }
  return 'Volkern <noreply@volkern.app>'
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
