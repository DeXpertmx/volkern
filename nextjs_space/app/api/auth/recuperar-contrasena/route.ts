export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import crypto from 'crypto'
import { sendEmail } from '@/lib/resend-email'

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json()

    if (!email) {
      return NextResponse.json(
        { error: 'Email es requerido' },
        { status: 400 }
      )
    }

    // Buscar usuario por email incluyendo estado del dominio email
    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        tenant: {
          select: {
            id: true,
            nombre: true,
            subdomain: true,
            emailDomainStatus: true,
          },
        },
      },
    })

    // Por seguridad, siempre devolvemos la misma respuesta aunque el usuario no exista
    if (!user) {
      return NextResponse.json({
        message: 'Si el email existe, recibirás instrucciones para recuperar tu contraseña',
      })
    }

    // Generar token de recuperación (válido por 1 hora)
    const resetToken = crypto.randomBytes(32).toString('hex')
    const resetTokenExpiry = new Date(Date.now() + 60 * 60 * 1000) // 1 hora

    // Guardar token en la base de datos
    await prisma.user.update({
      where: { id: user.id },
      data: {
        resetToken,
        resetTokenExpiry,
      },
    })

    // Construir URL de reseteo
    const baseUrl = process.env.NEXTAUTH_URL || 'https://admin.volkern.app'
    const resetUrl = `${baseUrl}/auth/resetear-contrasena?token=${resetToken}`

    // Enviar email
    const emailContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
          <h1 style="color: white; margin: 0;">Volkern CRM</h1>
        </div>
        <div style="background: #f9fafb; padding: 40px; border-radius: 0 0 10px 10px;">
          <h2 style="color: #1f2937; margin-top: 0;">Recuperación de contraseña</h2>
          <p style="color: #4b5563; line-height: 1.6;">
            Hola ${user.name || 'Usuario'},
          </p>
          <p style="color: #4b5563; line-height: 1.6;">
            Recibimos una solicitud para recuperar la contraseña de tu cuenta en Volkern CRM.
          </p>
          <p style="color: #4b5563; line-height: 1.6;">
            Haz clic en el siguiente botón para crear una nueva contraseña:
          </p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${resetUrl}" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 14px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">
              Resetear Contraseña
            </a>
          </div>
          <p style="color: #6b7280; font-size: 14px; line-height: 1.6;">
            O copia y pega este enlace en tu navegador:<br/>
            <a href="${resetUrl}" style="color: #667eea; word-break: break-all;">${resetUrl}</a>
          </p>
          <div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0; border-radius: 4px;">
            <p style="color: #92400e; margin: 0; font-size: 14px;">
              <strong>⚠️ Importante:</strong> Este enlace expirará en 1 hora por seguridad.
            </p>
          </div>
          <p style="color: #6b7280; font-size: 14px; line-height: 1.6;">
            Si no solicitaste este cambio, puedes ignorar este email. Tu contraseña no será modificada.
          </p>
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;" />
          <p style="color: #9ca3af; font-size: 12px; text-align: center;">
            © ${new Date().getFullYear()} Volkern CRM. Todos los derechos reservados.
          </p>
        </div>
      </div>
    `

    // Intentar enviar con el dominio del tenant si está verificado
    // Si falla o el dominio no está verificado, usar onboarding@resend.dev
    const usarDominioTenant = user.tenant?.emailDomainStatus === 'verified' && !!user.tenant.subdomain;
    
    console.log(`[Recovery] Enviando email a ${user.email} (usarDominioTenant: ${usarDominioTenant}, subdomain: ${user.tenant?.subdomain}, status: ${user.tenant?.emailDomainStatus})`);

    let emailSent = false;
    
    // Intento 1: con dominio del tenant (si aplica)
    if (usarDominioTenant) {
      try {
        const result = await sendEmail({
          to: user.email,
          subject: 'Recuperación de contraseña - Volkern CRM',
          html: emailContent,
          tenantSubdomain: user.tenant!.subdomain!,
          tenantName: user.tenant!.nombre || 'Volkern',
        });
        emailSent = result.success;
        if (!emailSent) {
          console.warn(`[Recovery] Falló envío con dominio tenant: ${result.error}`);
        }
      } catch (err) {
        console.error('[Recovery] Error en envío con dominio tenant:', err);
      }
    }

    // Intento 2: fallback a onboarding@resend.dev (si el primero falló o no aplicaba)
    if (!emailSent) {
      try {
        const result = await sendEmail({
          to: user.email,
          subject: 'Recuperación de contraseña - Volkern CRM',
          html: emailContent,
          from: 'Volkern CRM <onboarding@resend.dev>',
        });
        emailSent = result.success;
        if (!emailSent) {
          console.error(`[Recovery] Falló también el envío con onboarding@resend.dev: ${result.error}`);
        }
      } catch (err) {
        console.error('[Recovery] Error en envío con onboarding@resend.dev:', err);
      }
    }

    // Registrar en audit log (con try/catch individual para no romper la respuesta)
    try {
      await prisma.auditLog.create({
        data: {
          userId: user.id,
          tenantId: user.tenantId,
          accion: 'password_reset_requested',
          entidad: 'User',
          entidadId: user.id,
          descripcion: 'Solicitud de recuperación de contraseña',
        },
      })
    } catch (auditError) {
      console.error('[Recovery] Error al registrar audit log:', auditError);
    }

    if (!emailSent) {
      console.error(`[Recovery] No se pudo enviar el email de recuperación a ${user.email}`);
      // Aún así devolvemos 200 por seguridad (no revelar si el email existe o no)
      return NextResponse.json({
        message: 'Si el email existe, recibirás instrucciones para recuperar tu contraseña',
      })
    }

    return NextResponse.json({
      message: 'Si el email existe, recibirás instrucciones para recuperar tu contraseña',
    })
  } catch (error) {
    console.error('[Recovery] Error en recuperación de contraseña:', error)
    if (error instanceof Error) {
      console.error('[Recovery] Stack:', error.stack)
    }
    return NextResponse.json(
      { error: 'Error al procesar la solicitud' },
      { status: 500 }
    )
  }
}
