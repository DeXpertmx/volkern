export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

// GET /api/tareas/[id]/entregas - Obtener entregas de una tarea
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const entregas = await prisma.entregaTarea.findMany({
      where: { tareaId: params.id },
      include: {
        estudiante: {
          select: {
            nombre: true,
            email: true,
          },
        },
      },
      orderBy: {
        fechaEntrega: 'desc',
      },
    });

    return NextResponse.json(entregas);
  } catch (error) {
    console.error('Error al obtener entregas:', error);
    return NextResponse.json({ error: 'Error al obtener entregas' }, { status: 500 });
  }
}

// POST /api/tareas/[id]/entregas - Enviar una entrega
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
    const { estudianteId, contenido, archivoUrl, enlaceUrl } = body;

    const entrega = await prisma.entregaTarea.create({
      data: {
        tareaId: params.id,
        estudianteId,
        contenido,
        archivoUrl,
        enlaceUrl,
      },
      include: {
        estudiante: {
          select: {
            nombre: true,
            email: true,
          },
        },
      },
    });

    return NextResponse.json(entrega, { status: 201 });
  } catch (error) {
    console.error('Error al crear entrega:', error);
    return NextResponse.json({ error: 'Error al crear entrega' }, { status: 500 });
  }
}
