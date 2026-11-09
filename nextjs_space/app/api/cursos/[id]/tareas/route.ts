export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

// POST /api/cursos/[id]/tareas - Crear una tarea para un curso
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const body = await request.json();
    const {
      titulo,
      descripcion,
      instrucciones,
      tipoEntrega,
      archivoPermitido,
      tamanoMaxMB,
      fechaLimite,
      puntuajeMaximo,
    } = body;

    const tarea = await prisma.tarea.create({
      data: {
        titulo,
        descripcion,
        instrucciones,
        tipoEntrega: tipoEntrega || 'file',
        archivoPermitido,
        tamanoMaxMB: tamanoMaxMB || 10,
        fechaLimite,
        puntuajeMaximo: puntuajeMaximo || 100,
      },
    });

    return NextResponse.json(tarea, { status: 201 });
  } catch (error) {
    console.error('Error al crear tarea:', error);
    return NextResponse.json({ error: 'Error al crear tarea' }, { status: 500 });
  }
}
