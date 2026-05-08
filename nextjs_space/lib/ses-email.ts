import nodemailer from 'nodemailer';

// Mapeo de subdominios a direcciones from (puedes expandir esto)
const FROM_ADDRESSES: Record<string, string> = {
  admin: 'Volkern <noreply@volkern.app>',
  demo: 'Volkern <noreply@volkern.app>',
  default: process.env.EMAIL_FROM || 'Volkern <noreply@volkern.app>'
};

// Obtener dirección FROM basada en el subdomain del tenant
export function getFromAddress(tenantSubdomain?: string): string {
  if (tenantSubdomain && FROM_ADDRESSES[tenantSubdomain]) {
    return FROM_ADDRESSES[tenantSubdomain];
  }
  return FROM_ADDRESSES.default;
}

// Configuración del transporte de Nodemailer para Amazon SES
const transporter = nodemailer.createTransport({
  host: `email-smtp.${process.env.AWS_SES_REGION || 'eu-north-1'}.amazonaws.com`,
  port: 587,
  secure: false, // true para 465, false para otros puertos
  auth: {
    user: process.env.AWS_SES_USER,
    pass: process.env.AWS_SES_PASSWORD,
  },
});

interface SendEmailParams {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  from?: string;
  replyTo?: string;
  tenantSubdomain?: string; // IMPORTANTE: Para aislamiento de reputación
}

/**
 * Envía un email utilizando Amazon SES vía SMTP con soporte para Tenants
 */
export async function sendEmail({
  to,
  subject,
  html,
  text,
  from,
  replyTo,
  tenantSubdomain,
}: SendEmailParams) {
  const fromAddress = from || getFromAddress(tenantSubdomain);
  
  try {
    const info = await transporter.sendMail({
      from: fromAddress,
      to: Array.isArray(to) ? to.join(', ') : to,
      subject,
      text,
      html,
      replyTo,
      headers: {
        // La clave para el aislamiento de reputación en SES
        'X-SES-TENANT': tenantSubdomain || 'default',
      },
    });

    console.log('[SES] Email enviado:', info.messageId);
    
    return {
      success: true,
      messageId: info.messageId,
      data: info,
    };
  } catch (error: any) {
    console.error('[SES] Error enviando email:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Envío masivo de emails (secuencial o paralelo limitado)
 */
export async function sendBulkEmail(emails: SendEmailParams[]) {
  try {
    const results = await Promise.allSettled(
      emails.map(email => sendEmail(email))
    );
    
    return {
      success: true,
      results: results.map((result, index) => ({
        to: emails[index].to,
        status: result.status,
        data: result.status === 'fulfilled' ? result.value : null,
        error: result.status === 'rejected' ? result.reason : null,
      })),
    };
  } catch (error: any) {
    console.error('[SES] Error en envío masivo:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

// Función para reemplazar variables en templates
export function replaceTemplateVariables(
  template: string,
  variables: Record<string, string>
): string {
  let result = template;
  
  Object.entries(variables).forEach(([key, value]) => {
    const regex = new RegExp(`\\{${key}\\}`, 'g');
    result = result.replace(regex, value);
  });
  
  return result;
}
