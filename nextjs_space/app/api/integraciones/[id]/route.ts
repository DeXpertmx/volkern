export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { logAuditAction } from '@/lib/permissions';

// DELETE - Eliminar una integración
export async function DELETE(
  request: Request,
  { params: paramsPromise }: { params: Promise<{ id: string }> }
) {
  const params = await paramsPromise;
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email! }
    });

    if (!user?.tenantId) {
      return NextResponse.json({ error: 'Usuario sin tenant' }, { status: 403 });
    }

    const integracion = await prisma.integration.findUnique({
      where: { id: params.id }
    });

    if (!integracion || integracion.tenantId !== user.tenantId) {
      return NextResponse.json({ error: 'Integración no encontrada' }, { status: 404 });
    }

    await prisma.integration.delete({
      where: { id: params.id }
    });

    // Registrar en audit log
    await logAuditAction(
      user.id,
      user.tenantId,
      'eliminar',
      'integracion',
      params.id,
      `Usuario ${user.name} eliminó la integración ${integracion.nombre}`
    );

    return NextResponse.json({ success: true, message: 'Integración eliminada' });
  } catch (error) {
    console.error('Error al eliminar integración:', error);
    return NextResponse.json(
      { error: 'Error al eliminar integración' },
      { status: 500 }
    );
  }
}

// PATCH - Actualizar estado de una integración
export async function PATCH(
  request: Request,
  { params: paramsPromise }: { params: Promise<{ id: string }> }
) {
  const params = await paramsPromise;
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email! }
    });

    if (!user?.tenantId) {
      return NextResponse.json({ error: 'Usuario sin tenant' }, { status: 403 });
    }

    const data = await request.json();
    const { activo } = data;

    const integracion = await prisma.integration.findUnique({
      where: { id: params.id }
    });

    if (!integracion || integracion.tenantId !== user.tenantId) {
      return NextResponse.json({ error: 'Integración no encontrada' }, { status: 404 });
    }

    const integracionActualizada = await prisma.integration.update({
      where: { id: params.id },
      data: {
        activo: activo ?? integracion.activo
      }
    });

    // Registrar en audit log
    await logAuditAction(
      user.id,
      user.tenantId,
      'actualizar',
      'integracion',
      params.id,
      `Usuario ${user.name} ${activo ? 'activó' : 'desactivó'} la integración ${integracion.nombre}`
    );

    return NextResponse.json({
      success: true,
      integracion: {
        ...integracionActualizada,
        credenciales: { configurado: true }
      }
    });
  } catch (error) {
    console.error('Error al actualizar integración:', error);
    return NextResponse.json(
      { error: 'Error al actualizar integración' },
      { status: 500 }
    );
  }
}
