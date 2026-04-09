export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

// POST /api/inscripciones/[id]/progreso - Actualizar progreso de una lección
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const body = await request.json();
    const { leccionId, completado, tiempoVisto } = body;

    const inscripcion = await prisma.inscripcion.findUnique({
      where: { id: params.id },
      include: {
        estudiante: true,
      },
    });

    if (!inscripcion) {
      return NextResponse.json({ error: 'Inscripción no encontrada' }, { status: 404 });
    }

    // Update or create lesson progress
    const progreso = await prisma.progresoLeccion.upsert({
      where: {
        estudianteId_leccionId: {
          estudianteId: inscripcion.estudianteId,
          leccionId,
        },
      },
      update: {
        completado,
        tiempoVisto,
        fechaCompletado: completado ? new Date() : null,
      },
      create: {
        estudianteId: inscripcion.estudianteId,
        leccionId,
        completado,
        tiempoVisto,
        fechaCompletado: completado ? new Date() : null,
      },
    });

    // Recalculate enrollment progress
    const leccionesCompletadas = await prisma.progresoLeccion.count({
      where: {
        estudianteId: inscripcion.estudianteId,
        completado: true,
        leccion: {
          modulo: {
            cursoId: inscripcion.cursoId,
          },
        },
      },
    });

    const progresoPorcentaje =
      inscripcion.totalLecciones > 0
        ? (leccionesCompletadas / inscripcion.totalLecciones) * 100
        : 0;

    const inscripcionActualizada = await prisma.inscripcion.update({
      where: { id: params.id },
      data: {
        progresoPorcentaje,
        leccionesCompletadas,
        ultimaLeccionId: leccionId,
        fechaUltimoAcceso: new Date(),
        fechaCompletado:
          progresoPorcentaje === 100 && !inscripcion.fechaCompletado
            ? new Date()
            : inscripcion.fechaCompletado,
        estado: progresoPorcentaje === 100 ? 'completado' : inscripcion.estado,
      },
    });

    return NextResponse.json({
      progreso,
      inscripcion: inscripcionActualizada,
    });
  } catch (error) {
    console.error('Error al actualizar progreso:', error);
    return NextResponse.json({ error: 'Error al actualizar progreso' }, { status: 500 });
  }
}
