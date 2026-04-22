export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { AcademyAuthService } from '@/lib/auth/academy-auth';
import { prisma } from '@/lib/db';

/**
 * GET /api/estudiantes/perfil - Obtener el perfil del alumno actual
 */
export async function GET(request: NextRequest) {
  try {
    let email: string | undefined;
    let estudianteId: string | undefined;

    // Intentar obtener sesión de next-auth
    const session = await getServerSession(authOptions);
    if (session?.user?.email) {
      email = session.user.email;
    } else {
      // Intentar obtener token de la academia
      const academyToken = request.cookies.get('academy_token')?.value;
      if (academyToken) {
        const academySession = await AcademyAuthService.validateToken(academyToken);
        if (academySession) {
          estudianteId = academySession.estudianteId;
        }
      }
    }

    if (!email && !estudianteId) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const estudiante = await prisma.estudiante.findFirst({
      where: {
        OR: [
          { email: email },
          { id: estudianteId }
        ]
      },
      include: {
        _count: {
          select: {
            inscripciones: true,
            certificados: true,
          },
        },
      },
    });

    if (!estudiante) {
      return NextResponse.json({ error: 'Estudiante no encontrado' }, { status: 404 });
    }

    return NextResponse.json(estudiante);
  } catch (error) {
    console.error('Error al obtener perfil del estudiante:', error);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}

/**
 * PUT /api/estudiantes/perfil - Actualizar preferencias del alumno
 */
export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const body = await request.json();
    const { 
      primerNombre,
      apellidoPaterno,
      apellidoMaterno,
      telefono,
      pais,
      region,
      zonaHoraria,
      preferenciasNotificacion,
      consentimientoGDPR
    } = body;

    const estudiante = await prisma.estudiante.findFirst({
      where: { email: session.user.email },
    });

    if (!estudiante) {
      return NextResponse.json({ error: 'Estudiante no encontrado' }, { status: 404 });
    }

    // Actualizar perfil
    const updatedEstudiante = await prisma.estudiante.update({
      where: { id: estudiante.id },
      data: {
        primerNombre,
        apellidoPaterno,
        apellidoMaterno,
        nombre: `${primerNombre || ''} ${apellidoPaterno || ''}`.trim() || estudiante.nombre,
        telefono,
        pais,
        region,
        zonaHoraria,
        preferenciasNotificacion,
        consentimientoGDPR,
        fechaConsentimiento: consentimientoGDPR ? new Date() : estudiante.fechaConsentimiento,
      },
    });

    return NextResponse.json(updatedEstudiante);
  } catch (error: any) {
    console.error('Error al actualizar perfil del estudiante:', error);
    return NextResponse.json({ 
      error: 'Error al actualizar perfil',
      details: error?.message 
    }, { status: 500 });
  }
}
