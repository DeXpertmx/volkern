export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import prisma from '@/lib/db';

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
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

    // Obtener todos los módulos y lecciones
    const modulos = await prisma.modulo.findMany({
      where: { cursoId },
      include: {
        lecciones: {
          orderBy: { orden: 'asc' },
        },
      },
      orderBy: { orden: 'asc' },
    });

    // Obtener progreso de todas las lecciones
    const progresoLecciones = await prisma.progresoLeccion.findMany({
      where: {
        estudianteId: estudiante.id,
      },
    });

    // Crear mapa de progreso
    const progresoMap = new Map(
      progresoLecciones.map((p) => [p.leccionId, p.completado])
    );

    // Aplanar lecciones con información de módulo
    const leccionesList = modulos.flatMap((modulo) =>
      modulo.lecciones.map((leccion) => ({
        id: leccion.id,
        titulo: leccion.titulo,
        completada: progresoMap.get(leccion.id) || false,
        orden: leccion.orden,
        moduloTitulo: modulo.titulo,
        moduloOrden: modulo.orden,
      }))
    );

    // Ordenar por módulo y luego por lección
    leccionesList.sort((a, b) => {
      if (a.moduloOrden !== b.moduloOrden) {
        return a.moduloOrden - b.moduloOrden;
      }
      return a.orden - b.orden;
    });

    return NextResponse.json(leccionesList);
  } catch (error) {
    console.error('Error al obtener lista de lecciones:', error);
    return NextResponse.json(
      { error: 'Error al obtener lista de lecciones' },
      { status: 500 }
    );
  }
}
