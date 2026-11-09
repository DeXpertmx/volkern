export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

// PUT /api/modulos/[id] - Actualizar un módulo
export async function PUT(
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
    const { titulo, descripcion, orden } = body;

    const modulo = await prisma.modulo.update({
      where: { id: params.id },
      data: {
        titulo,
        descripcion,
        orden,
      },
    });

    return NextResponse.json(modulo);
  } catch (error) {
    console.error('Error al actualizar módulo:', error);
    return NextResponse.json({ error: 'Error al actualizar módulo' }, { status: 500 });
  }
}

// DELETE /api/modulos/[id] - Eliminar un módulo
export async function DELETE(
  request: NextRequest,
  { params: paramsPromise }: { params: Promise<{ id: string }> }
) {
  const params = await paramsPromise;
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    await prisma.modulo.delete({
      where: { id: params.id },
    });

    return NextResponse.json({ message: 'Módulo eliminado exitosamente' });
  } catch (error) {
    console.error('Error al eliminar módulo:', error);
    return NextResponse.json({ error: 'Error al eliminar módulo' }, { status: 500 });
  }
}
