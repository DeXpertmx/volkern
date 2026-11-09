export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

// POST /api/inscripciones/[id]/progreso - Actualizar progreso de una lección
export async function POST(
  request: NextRequest,
  { params: paramsPromise }: { params: Promise<{ id: string }> }
) {
  const params = await paramsPromise;
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

    const cursoRecienCompletado =
      progresoPorcentaje === 100 && !inscripcion.fechaCompletado;

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

    // Disparar automatizaciones del módulo Academia
    try {
      const { emitLeccionCompletada, emitCursoCompletado } = await import('@/lib/academy/automation-events');
      const curso = await prisma.curso.findUnique({ where: { id: inscripcion.cursoId } });
      const leccion = await prisma.leccion.findUnique({ where: { id: leccionId } });

      if (completado) {
        await emitLeccionCompletada({
          tenantId: curso?.tenantId,
          estudianteId: inscripcion.estudianteId,
          cursoId: inscripcion.cursoId,
          leccionId,
          inscripcionId: inscripcion.id,
          estudiante: inscripcion.estudiante as any,
          curso: curso as any,
          leccion: leccion as any,
        });
      }

      if (cursoRecienCompletado) {
        await emitCursoCompletado({
          tenantId: curso?.tenantId,
          estudianteId: inscripcion.estudianteId,
          cursoId: inscripcion.cursoId,
          inscripcionId: inscripcion.id,
          estudiante: inscripcion.estudiante as any,
          curso: curso as any,
          inscripcion: inscripcionActualizada as any,
        });
      }
    } catch (e) {
      console.error('Error emitiendo triggers de Academia:', e);
    }

    return NextResponse.json({
      progreso,
      inscripcion: inscripcionActualizada,
    });
  } catch (error) {
    console.error('Error al actualizar progreso:', error);
    return NextResponse.json({ error: 'Error al actualizar progreso' }, { status: 500 });
  }
}
