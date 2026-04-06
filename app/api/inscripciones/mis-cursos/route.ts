export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import prisma from '@/lib/db';

export async function GET() {
  try {
    const session = await getServerSession();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    // Obtener el estudiante
    const estudiante = await prisma.estudiante.findFirst({
      where: { email: session.user.email },
    });

    if (!estudiante) {
      return NextResponse.json({ error: 'Estudiante no encontrado' }, { status: 404 });
    }

    // Obtener inscripciones
    const inscripciones = await prisma.inscripcion.findMany({
      where: {
        estudianteId: estudiante.id,
      },
      include: {
        curso: {
          include: {
            _count: {
              select: { modulos: true },
            },
            modulos: {
              include: {
                lecciones: {
                  select: { id: true },
                },
              },
              orderBy: { orden: 'asc' },
            },
          },
        },
      },
      orderBy: { fechaInscripcion: 'desc' },
    });

    // Calcular progreso para cada inscripción
    const inscripcionesConProgreso = await Promise.all(
      inscripciones.map(async (inscripcion) => {
        const totalLecciones = inscripcion.curso.modulos.reduce(
          (acc, mod) => acc + mod.lecciones.length,
          0
        );

        if (totalLecciones === 0) {
          return {
            ...inscripcion,
            progreso: 0,
            completado: false,
          };
        }

        // Contar lecciones completadas
        const leccionesCompletadas = await prisma.progresoLeccion.count({
          where: {
            estudianteId: estudiante.id,
            completado: true,
            leccion: {
              modulo: {
                cursoId: inscripcion.curso.id,
              },
            },
          },
        });

        const progreso = Math.round((leccionesCompletadas / totalLecciones) * 100);
        const completado = progreso === 100;

        return {
          ...inscripcion,
          progreso,
          completado,
        };
      })
    );

    return NextResponse.json(inscripcionesConProgreso);
  } catch (error) {
    console.error('Error al obtener inscripciones:', error);
    return NextResponse.json(
      { error: 'Error al obtener inscripciones' },
      { status: 500 }
    );
  }
}
