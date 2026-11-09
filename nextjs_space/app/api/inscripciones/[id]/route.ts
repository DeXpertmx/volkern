export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import prisma from '@/lib/db';

export async function GET(
  request: Request,
  { params: paramsPromise }: { params: Promise<{ id: string }> }
) {
  const params = await paramsPromise;
  try {
    const session = await getServerSession();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const cursoId = params.id;

    // Obtener el estudiante
    const estudiante = await prisma.estudiante.findFirst({
      where: { email: session.user.email },
    });

    if (!estudiante) {
      return NextResponse.json({ error: 'Estudiante no encontrado' }, { status: 404 });
    }

    // Buscar inscripción
    const inscripcion = await prisma.inscripcion.findFirst({
      where: {
        cursoId,
        estudianteId: estudiante.id,
      },
    });

    if (!inscripcion) {
      return NextResponse.json({ error: 'No inscrito en este curso' }, { status: 404 });
    }

    // Calcular progreso
    const totalLecciones = await prisma.leccion.count({
      where: {
        modulo: {
          cursoId,
        },
      },
    });

    const leccionesCompletadas = await prisma.progresoLeccion.count({
      where: {
        estudianteId: estudiante.id,
        completado: true,
        leccion: {
          modulo: {
            cursoId,
          },
        },
      },
    });

    const progreso = totalLecciones > 0 
      ? Math.round((leccionesCompletadas / totalLecciones) * 100)
      : 0;
    
    const completado = progreso === 100;

    return NextResponse.json({
      ...inscripcion,
      progreso,
      completado,
    });
  } catch (error) {
    console.error('Error al obtener inscripción:', error);
    return NextResponse.json(
      { error: 'Error al obtener inscripción' },
      { status: 500 }
    );
  }
}
