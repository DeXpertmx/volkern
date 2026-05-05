
// Email via Resend

interface ResendCredentials {
  api_key: string
}

// Mapeo de subdominios a direcciones from
const FROM_ADDRESSES: Record<string, string> = {
  admin: 'Volkern <noreply@volkern.app>',
  demo: 'Volkern <noreply@volkern.app>',
  default: 'Volkern <noreply@volkern.app>'
}

let credentials: ResendCredentials | null = null

// Obtener dirección FROM basada en el subdomain del tenant
export function getFromAddress(tenantSubdomain?: string): string {
  if (tenantSubdomain && FROM_ADDRESSES[tenantSubdomain]) {
    return FROM_ADDRESSES[tenantSubdomain]
  }
  return FROM_ADDRESSES.default
}

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

interface SendEmailParams {
  to: string | string[]
  subject: string
  html?: string
  text?: string
  from?: string
  replyTo?: string
  tenantSubdomain?: string // NEW: para enviar desde el email del tenant
}

export async function sendEmail({
  to,
  subject,
  html,
  text,
  from, // Ahora este from tiene prioridad sobre el automático
  replyTo,
  tenantSubdomain, // NEW
}: SendEmailParams) {
  // Si no se especifica from, usar el del tenant subdomain
  const fromAddress = from || getFromAddress(tenantSubdomain)
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
