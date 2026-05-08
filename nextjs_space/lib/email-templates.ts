interface EmailParams {
  tenantName: string;
  daysRemaining?: number;
  trialEndDate?: string;
  upgradeUrl?: string;
  supportEmail?: string;
}

export async function sendTrialReminderEmail(
  email: string,
  tenantName: string,
  daysRemaining: number
): Promise<void> {
  const subject = daysRemaining === 3 
    ? `🎉 Tu prueba gratuita de Volkern termina en 3 días` 
    : `⚠️ Tu prueba gratuita de Volkern termina mañana`;

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px; text-align: center;">
    <h1 style="color: white; margin: 0;">🎉 Tu Prueba Gratuita</h1>
  </div>
  
  <div style="padding: 20px; background: #f9f9f9; border-radius: 10px; margin-top: 20px;">
    <p style="font-size: 18px;">Hola <strong>${tenantName}</strong>,</p>
    
    <p>¡Queremos que saques el máximo provecho de tu prueba gratuita de Volkern!</p>
    
    <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0; text-align: center;">
      <p style="font-size: 24px; font-weight: bold; color: #667eea; margin: 0;">
        ${daysRemaining === 3 ? '3 días' : '1 día'}
      </p>
      <p style="margin: 5px 0 0 0; color: #666;">restantes en tu prueba</p>
    </div>
    
    <p>Durante tu prueba has podido explorar todas las funcionalidades principales de Volkern:</p>
    <ul style="list-style: none; padding: 0;">
      <li style="padding: 8px 0;">✅ CRM y gestión de leads</li>
      <li style="padding: 8px 0;">✅ Pipeline de ventas</li>
      <li style="padding: 8px 0;">✅ Mensajería y automatización</li>
      <li style="padding: 8px 0;">✅ Citas y calendario</li>
      <li style="padding: 8px 0;">✅ Analytics</li>
    </ul>
    
    <div style="text-align: center; margin: 30px 0;">
      <a href="${process.env.NEXT_PUBLIC_APP_URL || 'https://volkern.app'}/checkout" style="background: #667eea; color: white; padding: 15px 30px; border-radius: 8px; text-decoration: none; font-weight: bold; display: inline-block;">
        ¡Actualizar a Premium Ahora!
      </a>
    </div>
    
    <p style="font-size: 14px; color: #666;">
      ¿Necesitas más tiempo? Contáctanos y podemos extender tu período de prueba.
    </p>
  </div>
  
  <div style="text-align: center; margin-top: 20px; padding-top: 20px; border-top: 1px solid #eee; color: #999; font-size: 12px;">
    <p>© ${new Date().getFullYear()} Volkern. Todos los derechos reservados.</p>
    <p>¿Tienes preguntas? Responde a este email o escribe a soporte@vokerin.app</p>
  </div>
</body>
</html>
  `.trim();

  await sendEmail(email, subject, html);
}

export async function sendTrialExpirationEmail(
  email: string,
  tenantName: string
): Promise<void> {
  const subject = `Tu prueba gratuita de Volkern ha terminado`;
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); padding: 30px; border-radius: 10px; text-align: center;">
    <h1 style="color: white; margin: 0;">⚠️ Prueba Finalizada</h1>
  </div>
  
  <div style="padding: 20px; background: #f9f9f9; border-radius: 10px; margin-top: 20px;">
    <p style="font-size: 18px;">Hola <strong>${tenantName}</strong>,</p>
    
    <p>Tu período de prueba gratuita de Volkern ha terminado. Esperamos que hayas podido aprovechar al máximo todas las funcionalidades.</p>
    
    <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0;">
      <h3 style="margin-top: 0; color: #f5576c;">¿Qué pasó con tus datos?</h3>
      <p style="margin-bottom: 0;">No te preocupes, tu información está segura. Puedes volver a acceder a tu cuenta en cualquier momento actualizando a un plan premium.</p>
    </div>
    
    <div style="text-align: center; margin: 30px 0;">
      <a href="${process.env.NEXT_PUBLIC_APP_URL || 'https://volkern.app'}/checkout" style="background: #f5576c; color: white; padding: 15px 30px; border-radius: 8px; text-decoration: none; font-weight: bold; display: inline-block;">
        Ver Planes y Precios
      </a>
    </div>
    
    <p style="font-size: 14px; color: #666; text-align: center;">
      ¿Tienes preguntas? Contáctanos en soporte@vokerin.app
    </p>
  </div>
  
  <div style="text-align: center; margin-top: 20px; padding-top: 20px; border-top: 1px solid #eee; color: #999; font-size: 12px;">
    <p>© ${new Date().getFullYear()} Volkern. Todos los derechos reservados.</p>
  </div>
</body>
</html>
  `.trim();

  await sendEmail(email, subject, html);
}

export async function sendTrialWelcomeEmail(
  email: string,
  tenantName: string,
  trialDays: number,
  trialEndDate: string
): Promise<void> {
  const subject = `🎉 ¡Bienvenido a tu prueba gratuita de Volkern!`;
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%); padding: 30px; border-radius: 10px; text-align: center;">
    <h1 style="color: white; margin: 0;">🎉 ¡Bienvenido a Volkern!</h1>
  </div>
  
  <div style="padding: 20px; background: #f9f9f9; border-radius: 10px; margin-top: 20px;">
    <p style="font-size: 18px;">Hola <strong>${tenantName}</strong>,</p>
    
    <p>¡Gracias por probar Volkern! Tienes <strong>${trialDays} días</strong> de acceso completo a todas nuestras funcionalidades.</p>
    
    <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0; text-align: center;">
      <p style="font-size: 14px; color: #666; margin: 0;">Tu prueba termina el</p>
      <p style="font-size: 20px; font-weight: bold; color: #11998e; margin: 5px 0;">
        ${new Date(trialEndDate).toLocaleDateString('es-ES', { 
          weekday: 'long', 
          year: 'numeric', 
          month: 'long', 
          day: 'numeric' 
        })}
      </p>
    </div>
    
    <h3 style="color: #333;">¿Qué puedes hacer con Volkern?</h3>
    <ul style="list-style: none; padding: 0;">
      <li style="padding: 8px 0;">📊 <strong>CRM Completo</strong> - Gestiona tus leads y clientes</li>
      <li style="padding: 8px 0;">💬 <strong>Mensajería</strong> - WhatsApp, Email, SMS y más</li>
      <li style="padding: 8px 0;">📅 <strong>Citas</strong> - Agenda y calendario integrado</li>
      <li style="padding: 8px 0;">⚙️ <strong>Automatizaciones</strong> - Aprende y escala tu negocio</li>
      <li style="padding: 8px 0;">📈 <strong>Analytics</strong> - Métricas en tiempo real</li>
    </ul>
    
    <div style="text-align: center; margin: 30px 0;">
      <a href="${process.env.NEXT_PUBLIC_APP_URL || 'https://volkern.app'}/dashboard" style="background: #11998e; color: white; padding: 15px 30px; border-radius: 8px; text-decoration: none; font-weight: bold; display: inline-block;">
        ¡Comenzar Ahora!
      </a>
    </div>
    
    <p style="font-size: 14px; color: #666;">
      ¿Necesitas ayuda? Nuestro equipo está listo para ayudarte en soporte@vokerin.app
    </p>
  </div>
  
  <div style="text-align: center; margin-top: 20px; padding-top: 20px; border-top: 1px solid #eee; color: #999; font-size: 12px;">
    <p>© ${new Date().getFullYear()} Volkern. Todos los derechos reservados.</p>
  </div>
</body>
</html>
  `.trim();

  await sendEmail(email, subject, html);
}

async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  const { sendEmail: sendSESEmail } = await import('./ses-email');
  
  await sendSESEmail({
    to,
    subject,
    html,
    tenantSubdomain: 'system' // Emails de sistema usan un tenant genérico
  });
}