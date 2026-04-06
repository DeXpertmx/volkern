export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

// GET /api/lecciones/[id] - Obtener una lección específica
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user?.email) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const leccion = await prisma.leccion.findUnique({
      where: { id: params.id },
      include: {
        modulo: {
          include: {
            curso: true,
          },
        },
      },
    });

    if (!leccion) {
      return NextResponse.json({ error: 'Lección no encontrada' }, { status: 404 });
    }

    // Obtener el estudiante
    const estudiante = await prisma.estudiante.findFirst({
      where: { email: session.user.email },
    });

    // Si el estudiante existe, obtener su progreso
    if (estudiante) {
      const progreso = await prisma.progresoLeccion.findUnique({
        where: {
          estudianteId_leccionId: {
            estudianteId: estudiante.id,
            leccionId: params.id,
          },
        },
      });

      return NextResponse.json({
        ...leccion,
        completada: progreso?.completado || false,
      });
    }

    return NextResponse.json(leccion);
  } catch (error) {
    console.error('Error al obtener lección:', error);
    return NextResponse.json({ error: 'Error al obtener lección' }, { status: 500 });
  }
}

// PUT /api/lecciones/[id] - Actualizar una lección
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const body = await request.json();
    const {
      titulo,
      descripcion,
      contenido,
      videoUrl,
      videoTipo,
      duracionMinutos,
      materialesUrl,
      orden,
      tipoContenido,
    } = body;

    const leccion = await prisma.leccion.update({
      where: { id: params.id },
      data: {
        titulo,
        descripcion,
        contenido,
        videoUrl,
        videoTipo,
        duracionMinutos,
        materialesUrl,
        orden,
        tipoContenido,
      },
    });

    return NextResponse.json(leccion);
  } catch (error) {
    console.error('Error al actualizar lección:', error);
    return NextResponse.json({ error: 'Error al actualizar lección' }, { status: 500 });
  }
}

// DELETE /api/lecciones/[id] - Eliminar una lección
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    await prisma.leccion.delete({
      where: { id: params.id },
    });

    return NextResponse.json({ message: 'Lección eliminada exitosamente' });
  } catch (error) {
    console.error('Error al eliminar lección:', error);
    return NextResponse.json({ error: 'Error al eliminar lección' }, { status: 500 });
  }
}
