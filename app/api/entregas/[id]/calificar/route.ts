export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

// POST /api/entregas/[id]/calificar - Calificar una entrega
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
    const { puntuacion, retroalimentacion } = body;

    const entrega = await prisma.entregaTarea.update({
      where: { id: params.id },
      data: {
        estado: 'calificado',
        puntuacion,
        retroalimentacion,
        calificadoPor: session.user.id,
        fechaCalificacion: new Date(),
      },
      include: {
        estudiante: {
          select: {
            nombre: true,
            email: true,
          },
        },
        tarea: true,
      },
    });

    return NextResponse.json(entrega);
  } catch (error) {
    console.error('Error al calificar entrega:', error);
    return NextResponse.json({ error: 'Error al calificar entrega' }, { status: 500 });
  }
}
