export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import prisma from '@/lib/db';

/**
 * GET /api/estudiantes/inscripciones
 * Lista las inscripciones del estudiante autenticado, incluyendo su curso y el
 * progreso calculado. Acepta `?completado=true` para filtrar solo las completadas.
 * Consumido por /estudiante/certificados y /estudiante/mis-cursos.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const completado = searchParams.get('completado');

    const estudiante = await prisma.estudiante.findFirst({
      where: { email: session.user.email },
    });

    if (!estudiante) {
      return NextResponse.json({ error: 'Estudiante no encontrado' }, { status: 404 });
    }

    const inscripciones = await prisma.inscripcion.findMany({
      where: {
        estudianteId: estudiante.id,
        ...(completado === 'true' ? { estado: 'completado' } : {}),
      },
      include: {
        curso: {
          include: {
            _count: { select: { modulos: true } },
            modulos: {
              include: { lecciones: { select: { id: true } } },
              orderBy: { orden: 'asc' },
            },
          },
        },
      },
      orderBy: { fechaInscripcion: 'desc' },
    });

    // Calcular progreso y flag de completado a partir del conteo real
    const resultado = await Promise.all(
      inscripciones.map(async (inscripcion) => {
        const totalLecciones = inscripcion.curso.modulos.reduce(
          (acc, mod) => acc + mod.lecciones.length,
          0
        );

        if (totalLecciones === 0) {
          return { ...inscripcion, progreso: 0, completado: inscripcion.estado === 'completado' };
        }

        const leccionesCompletadas = await prisma.progresoLeccion.count({
          where: {
            estudianteId: estudiante.id,
            completado: true,
            leccion: { modulo: { cursoId: inscripcion.curso.id } },
          },
        });

        const progreso = Math.round((leccionesCompletadas / totalLecciones) * 100);
        return {
          ...inscripcion,
          progreso,
          completado: progreso === 100 || inscripcion.estado === 'completado',
        };
      })
    );

    return NextResponse.json(resultado);
  } catch (error) {
    console.error('Error al obtener inscripciones:', error);
    return NextResponse.json(
      { error: 'Error al obtener inscripciones' },
      { status: 500 }
    );
  }
}