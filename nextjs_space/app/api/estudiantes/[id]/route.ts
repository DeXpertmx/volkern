export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getSessionTenantId, tenantWhere } from '@/lib/academy/tenant-guard';

// GET /api/estudiantes/[id] - Obtener un estudiante específico
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const estudiante = await prisma.estudiante.findFirst({
      where: { id: params.id, ...tenantWhere(await getSessionTenantId(session.user?.email)) },
      include: {
        inscripciones: {
          include: {
            curso: {
              include: {
                modulos: {
                  include: {
                    lecciones: true,
                  },
                },
              },
            },
          },
        },
        progreso: {
          include: {
            leccion: {
              include: {
                modulo: true,
              },
            },
          },
        },
        certificados: {
          include: {
            curso: true,
          },
        },
      },
    });

    if (!estudiante) {
      return NextResponse.json({ error: 'Estudiante no encontrado' }, { status: 404 });
    }

    return NextResponse.json(estudiante);
  } catch (error) {
    console.error('Error al obtener estudiante:', error);
    return NextResponse.json({ error: 'Error al obtener estudiante' }, { status: 500 });
  }
}

// PUT /api/estudiantes/[id] - Actualizar un estudiante
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const existente = await prisma.estudiante.findFirst({
      where: { id: params.id, ...tenantWhere(await getSessionTenantId(session.user?.email)) },
      select: { id: true },
    });
    if (!existente) {
      return NextResponse.json({ error: 'Estudiante no encontrado' }, { status: 404 });
    }

    const body = await request.json();
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
      metadataTecnica,
      metadatosAcademicos,
      historialCompletitud,
      dispositivosUsados,
      interaccionesChatbot,
      preferenciasNotificacion,
      preferenciasDatos,
      registroAccesos
    } = body;

    const estudiante = await prisma.estudiante.update({
      where: { id: params.id },
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
        tipoAcceso,
        metodoPagoToken,
        fechaRenovacion: fechaRenovacion ? new Date(fechaRenovacion) : undefined,
        tags,
        consentimientoGDPR,
        metadataTecnica,
        metadatosAcademicos,
        historialCompletitud,
        dispositivosUsados,
        interaccionesChatbot,
        preferenciasNotificacion,
        preferenciasDatos,
        registroAccesos,
      },
    });

    return NextResponse.json(estudiante);
  } catch (error) {
    console.error('Error al actualizar estudiante:', error);
    return NextResponse.json({ error: 'Error al actualizar estudiante' }, { status: 500 });
  }
}

// DELETE /api/estudiantes/[id] - Eliminar un estudiante
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const existente = await prisma.estudiante.findFirst({
      where: { id: params.id, ...tenantWhere(await getSessionTenantId(session.user?.email)) },
      select: { id: true },
    });
    if (!existente) {
      return NextResponse.json({ error: 'Estudiante no encontrado' }, { status: 404 });
    }

    await prisma.estudiante.delete({
      where: { id: params.id },
    });

    return NextResponse.json({ message: 'Estudiante eliminado exitosamente' });
  } catch (error) {
    console.error('Error al eliminar estudiante:', error);
    return NextResponse.json({ error: 'Error al eliminar estudiante' }, { status: 500 });
  }
}
