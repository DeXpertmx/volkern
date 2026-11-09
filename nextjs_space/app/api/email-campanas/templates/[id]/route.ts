export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/db';
import { authOptions } from '@/lib/auth';

// GET /api/email-campanas/templates/[id] - Obtener plantilla
export async function GET(
  request: NextRequest,
  { params: paramsPromise }: { params: Promise<{ id: string }> }
) {
  const params = await paramsPromise;
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { tenantId: true }
    });

    if (!user?.tenantId) {
      return NextResponse.json({ error: 'Usuario sin tenant' }, { status: 403 });
    }

    const plantilla = await prisma.emailTemplate.findFirst({
      where: {
        id: params.id,
        OR: [
          { tenantId: user.tenantId },
          { esOficial: true }
        ]
      }
    });

    if (!plantilla) {
      return NextResponse.json({ error: 'Plantilla no encontrada' }, { status: 404 });
    }

    // Incrementar contador de uso
    await prisma.emailTemplate.update({
      where: { id: params.id },
      data: { vecesUtilizada: { increment: 1 } }
    });

    return NextResponse.json(plantilla);
  } catch (error: any) {
    console.error('Error al obtener plantilla:', error);
    return NextResponse.json(
      { error: 'Error al obtener plantilla', details: error.message },
      { status: 500 }
    );
  }
}

// DELETE /api/email-campanas/templates/[id] - Eliminar plantilla
export async function DELETE(
  request: NextRequest,
  { params: paramsPromise }: { params: Promise<{ id: string }> }
) {
  const params = await paramsPromise;
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { tenantId: true }
    });

    if (!user?.tenantId) {
      return NextResponse.json({ error: 'Usuario sin tenant' }, { status: 403 });
    }

    const plantilla = await prisma.emailTemplate.findFirst({
      where: {
        id: params.id,
        tenantId: user.tenantId,
        esOficial: false // No permitir eliminar plantillas oficiales
      }
    });

    if (!plantilla) {
      return NextResponse.json(
        { error: 'Plantilla no encontrada o no puede ser eliminada' },
        { status: 404 }
      );
    }

    await prisma.emailTemplate.delete({
      where: { id: params.id }
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error al eliminar plantilla:', error);
    return NextResponse.json(
      { error: 'Error al eliminar plantilla', details: error.message },
      { status: 500 }
    );
  }
}
