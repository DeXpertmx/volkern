export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { sendEmail } from '@/lib/resend-email';

// GET /api/estudiantes - Obtener todos los estudiantes
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const currentUser = await prisma.user.findUnique({
      where: { email: session.user.email },
    });

    const estudiantes = await prisma.estudiante.findMany({
      where: {
        tenantId: currentUser?.tenantId || undefined,
      },
      include: {
        inscripciones: {
          include: {
            curso: true,
          },
        },
        certificados: {
          include: {
            curso: true,
          },
        },
        _count: {
          select: {
            inscripciones: true,
            certificados: true,
          },
        },
      },
      orderBy: {
        fechaCreacion: 'desc',
      },
    });

    return NextResponse.json(estudiantes);
  } catch (error) {
    console.error('Error al obtener estudiantes:', error);
    return NextResponse.json({ error: 'Error al obtener estudiantes' }, { status: 500 });
  }
}

// POST /api/estudiantes - Crear un nuevo estudiante
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const currentUser = await prisma.user.findUnique({
      where: { email: session.user.email },
    });

    if (!currentUser?.tenantId) {
      return NextResponse.json({ error: 'Usuario sin tenant' }, { status: 400 });
    }

    const body = await request.json();
    console.log('Creando estudiante con data:', body);
    const { 
      nombre, 
      email, 
      telefono,
      primerNombre,
      apellidoPaterno,
      apellidoMaterno,
      pais,
      region,
      zonaHoraria,
      tipoAcceso,
      metodoPagoToken,
      fechaRenovacion,
      tags,
      consentimientoGDPR,
      metadataTecnica
    } = body;

    // Verificar si el estudiante ya existe en este tenant
    const estudianteExistente = await prisma.estudiante.findFirst({
      where: {
        email,
        tenantId: currentUser.tenantId,
      },
    });

    if (estudianteExistente) {
      return NextResponse.json(
        { error: 'Ya existe un estudiante con este email' },
        { status: 400 }
      );
    }

    // Generar la contraseña temporal de acceso al portal (portal /academy)
    const passwordTemporal = randomBytes(6).toString('base64url').replace(/[-_]/g, '').slice(0, 9);
    const hashedPassword = await bcrypt.hash(passwordTemporal, 12);
    const emailLower = email.toLowerCase();

    // Buscar o crear la cuenta de acceso (erp_academy_users) vinculada al tenant
    let cuentaAcceso = await prisma.erp_academy_users.findFirst({
      where: { tenantId: currentUser.tenantId, email: emailLower },
    });

    if (!cuentaAcceso) {
      cuentaAcceso = await prisma.erp_academy_users.create({
        data: {
          tenantId: currentUser.tenantId,
          email: emailLower,
          passwordHash: hashedPassword,
          firstName: primerNombre || nombre?.split(' ')[0],
          lastName: apellidoPaterno || apellidoMaterno,
          role: 'LEARNER',
          status: 'ACTIVE',
        } as any,
      });
    }

    const estudiante = await prisma.estudiante.create({
      data: {
        nombre,
        email,
        telefono,
        primerNombre,
        apellidoPaterno,
        apellidoMaterno,
        pais,
        region,
        zonaHoraria,
        tipoAcceso: tipoAcceso || 'free',
        metodoPagoToken,
        fechaRenovacion: fechaRenovacion ? new Date(fechaRenovacion) : null,
        tags: tags || [],
        consentimientoGDPR: consentimientoGDPR || false,
        fechaConsentimiento: consentimientoGDPR ? new Date() : null,
        metadataTecnica,
        tenantId: currentUser.tenantId,
        academyUserId: cuentaAcceso.id,
      },
    });

    // Enviar email con la contraseña de acceso al portal solo cuando la cuenta es nueva
    if (passwordTemporal) {
      try {
        const tenant = await prisma.tenant.findUnique({
          where: { id: currentUser.tenantId },
          select: { nombre: true, razonSocial: true, slug: true },
        });
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://volkern.app';
        const academiaUrl = `${appUrl}/academy/login`;
        const tenantName = tenant?.nombre || tenant?.razonSocial || 'Volkern';

        await sendEmail({
          to: email,
          subject: `🎓 Acceso a tu área de estudiante (${tenantName})`,
          tenantSubdomain: tenant?.slug,
          tenantName,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
              <div style="text-align: center; margin-bottom: 24px;">
                <h1 style="color: #4F46E5; margin: 0; font-size: 24px;">🎓 ¡Bienvenido a la Academia!</h1>
              </div>
              <p style="font-size: 16px; color: #374151;">Hola <strong>${primerNombre || nombre?.split(' ')[0] || ''}</strong>,</p>
              <p style="font-size: 15px; color: #374151;">Se ha creado tu acceso al portal de estudiante de <strong>${tenantName}</strong>.</p>
              <div style="background: #F5F3FF; padding: 20px; border-radius: 12px; margin: 20px 0; border: 1px solid #EDE9FE;">
                <p style="margin: 0 0 8px 0; color: #4F46E5; font-weight: bold;">Tus credenciales de acceso</p>
                <p style="margin: 0; font-size: 15px; color: #374151;">Email: <strong>${email}</strong></p>
                <p style="margin: 4px 0 0 0; font-size: 15px; color: #374151;">Contraseña temporal: <strong>${passwordTemporal}</strong></p>
              </div>
              <div style="text-align: center; margin: 28px 0;">
                <a href="${academiaUrl}" style="display: inline-block; background: #4F46E5; color: white; padding: 14px 32px; border-radius: 10px; text-decoration: none; font-weight: bold; font-size: 15px;">
                  Entrar a mi portal
                </a>
              </div>
              <p style="color: #6B7280; font-size: 13px;">Te recomendamos cambiar tu contraseña al entrar. Si no esperabas este correo, ignóralo.</p>
            </div>
          `,
        });
      } catch (e) {
        console.error('Error enviando email de acceso al estudiante:', e);
      }
    }

    return NextResponse.json(
      {
        ...estudiante,
        accesoCreado: !!cuentaAcceso,
        tieneAcceso: true,
        passwordTemporal: cuentaAcceso ? passwordTemporal : null,
        accesoEnviadoPorEmail: !!passwordTemporal,
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error('Error detail al crear estudiante:', error);
    return NextResponse.json({ 
      error: 'Error al crear estudiante',
      details: error?.message || String(error),
      code: error?.code,
    }, { status: 500 });
  }
}
