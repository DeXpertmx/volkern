export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

// POST /api/modulos/[id]/lecciones - Crear una nueva lección para un módulo
export async function POST(
  request: NextRequest,
  { params: paramsPromise }: { params: Promise<{ id: string }> }
) {
  const params = await paramsPromise;
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

    // Obtener el último orden si no se proporciona
    let ordenLeccion = orden;
    if (!ordenLeccion) {
      const ultimaLeccion = await prisma.leccion.findFirst({
        where: { moduloId: params.id },
        orderBy: { orden: 'desc' },
      });
      ordenLeccion = ultimaLeccion ? ultimaLeccion.orden + 1 : 1;
    }

    const leccion = await prisma.leccion.create({
      data: {
        moduloId: params.id,
        titulo,
        descripcion,
        contenido,
        videoUrl,
        videoTipo,
        duracionMinutos,
        materialesUrl,
        orden: ordenLeccion,
        tipoContenido: tipoContenido || 'video',
      },
    });

    return NextResponse.json(leccion, { status: 201 });
  } catch (error) {
    console.error('Error al crear lección:', error);
    return NextResponse.json({ error: 'Error al crear lección' }, { status: 500 });
  }
}
