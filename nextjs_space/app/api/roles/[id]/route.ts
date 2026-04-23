import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { hasPermission } from '@/lib/permissions';

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const currentUser = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: { role: true },
    });

    if (!currentUser) {
      return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 });
    }

    // Verificar permiso (solo Admin o Superadmin pueden editar roles)
    if (!hasPermission(currentUser, 'equipo', 'editar')) {
      return NextResponse.json({ error: 'Sin permiso para editar roles' }, { status: 403 });
    }

    const { nombre, descripcion, permisos } = await req.json();

    // No permitir editar el rol 'Superadmin'
    const targetRole = await prisma.role.findUnique({ where: { id: params.id } });
    if (targetRole?.nombre === 'Superadmin') {
      return NextResponse.json({ error: 'No se puede editar el rol Superadmin' }, { status: 403 });
    }

    const updatedRole = await prisma.role.update({
      where: { id: params.id },
      data: {
        nombre,
        descripcion,
        permisos: permisos || undefined,
      },
    });

    return NextResponse.json(updatedRole);
  } catch (error: any) {
    console.error('Error al actualizar rol:', error);
    return NextResponse.json({ error: 'Error al actualizar rol' }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const currentUser = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: { role: true },
    });

    if (!currentUser) {
      return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 });
    }

    if (!hasPermission(currentUser, 'equipo', 'eliminar')) {
      return NextResponse.json({ error: 'Sin permiso para eliminar roles' }, { status: 403 });
    }

    const targetRole = await prisma.role.findUnique({ where: { id: params.id } });
    if (targetRole?.nombre === 'Superadmin' || targetRole?.nombre === 'Admin') {
      return NextResponse.json({ error: 'No se pueden eliminar roles protegidos' }, { status: 403 });
    }

    await prisma.role.delete({ where: { id: params.id } });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error al eliminar rol:', error);
    return NextResponse.json({ error: 'Error al eliminar rol' }, { status: 500 });
  }
}
