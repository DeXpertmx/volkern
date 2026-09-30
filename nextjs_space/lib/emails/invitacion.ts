// Email de invitación al equipo — reutiliza el canal Resend multi-tenant.
//
// El token de invitación (User.tokenInvitacion) solo tiene valor si llega al
// invitado: sin este email el alta crea el usuario y muere en la BD. Aquí
// vive el único lugar que construye el enlace de aceptación, para que la
// API y el reenvío no copien la URL a mano.

import { sendEmail } from '@/lib/resend-email';

export interface InvitacionEmailParams {
  email: string;
  nombre: string;
  token: string;
  /** Contraseña temporal del alta (opcional en reenvíos: quien acepta crea una nueva). */
  tempPassword?: string;
  tenantNombre: string;
  invitadorNombre: string;
}

export function urlAceptarInvitacion(token: string): string {
  const base = process.env.NEXTAUTH_URL || 'https://volkern.app';
  return `${base}/auth/aceptar-invitacion?token=${encodeURIComponent(token)}`;
}

const DOS_SEMANAS_MS = 14 * 24 * 60 * 60 * 1000;

export async function enviarEmailInvitacion(p: InvitacionEmailParams) {
  const url = urlAceptarInvitacion(p.token);

  const bloquePassword = p.tempPassword
    ? `<div style="background:#f1f5f9;border-radius:8px;padding:15px 20px;margin:20px 0;">
         <p style="color:#334155;margin:0;font-size:14px;">
           <strong>Datos de acceso provisionales</strong><br/>
           Usuario: ${p.email}<br/>
           Contraseña temporal: <code style="background:#e2e8f0;padding:2px 6px;border-radius:4px;">${p.tempPassword}</code>
         </p>
         <p style="color:#64748b;margin:8px 0 0;font-size:12px;">
           Al aceptar la invitación crearás tu propia contraseña. Estas credenciales solo sirven si prefieres entrar directo en <a href="${process.env.NEXTAUTH_URL || 'https://volkern.app'}/auth/login" style="color:#667eea;">volkern.app/auth/login</a>.
         </p>
       </div>`
    : '';

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
        <h1 style="color: white; margin: 0;">Volkern CRM</h1>
      </div>
      <div style="background: #f9fafb; padding: 40px; border-radius: 0 0 10px 10px;">
        <h2 style="color: #1f2937; margin-top: 0;">Has sido invitado a colaborar</h2>
        <p style="color: #4b5563; line-height: 1.6;">
          Hola ${p.nombre},
        </p>
        <p style="color: #4b5563; line-height: 1.6;">
          <strong>${p.invitadorNombre}</strong> te invitó a unirte a la cuenta
          <strong>${p.tenantNombre}</strong> en Volkern.
        </p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${url}" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 14px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">
            Aceptar invitación
          </a>
        </div>
        <p style="color: #6b7280; font-size: 14px; line-height: 1.6;">
          O copia y pega este enlace en tu navegador:<br/>
          <a href="${url}" style="color: #667eea; word-break: break-all;">${url}</a>
        </p>
        ${bloquePassword}
        <div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0; border-radius: 4px;">
          <p style="color: #92400e; margin: 0; font-size: 14px;">
            <strong>⚠️ Importante:</strong> Este enlace expira en ${Math.round(DOS_SEMANAS_MS / (24 * 60 * 60 * 1000))} días. Si caduca, pide a ${p.invitadorNombre} que reenvíe la invitación desde el panel de Equipo.
          </p>
        </div>
        <p style="color: #6b7280; font-size: 14px; line-height: 1.6;">
          Si no esperabas esta invitación, puedes ignorar este email: no se creará ninguna cuenta hasta que la aceptes.
        </p>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;" />
        <p style="color: #9ca3af; font-size: 12px; text-align: center;">
          © ${new Date().getFullYear()} Volkern CRM. Todos los derechos reservados.
        </p>
      </div>
    </div>
  `;

  return sendEmail({
    to: p.email,
    subject: `${p.invitadorNombre} te invitó a ${p.tenantNombre} en Volkern`,
    html,
    text: `${p.invitadorNombre} te invitó a ${p.tenantNombre} en Volkern. Acepta tu invitación aquí: ${url}${
      p.tempPassword ? ` (contraseña temporal: ${p.tempPassword})` : ''
    }`,
  });
}
