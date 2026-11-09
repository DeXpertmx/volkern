export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { hasPermission, canManageUser, logAuditAction } from '@/lib/permissions';

// GET /api/users/[id] - Obtener usuario por ID
export async function GET(
  req: NextRequest,
  { params: paramsPromise }: { params: Promise<{ id: string }> }
) {
  const params = await paramsPromise;
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

    const user = await prisma.user.findUnique({
      where: { id: params.id },
      include: {
        role: {
          select: {
            id: true,
            nombre: true,
            descripcion: true,
            permisos: true,
          },
        },
      },
    });

    if (!user) {
      return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 });
    }

    // Verificar que el usuario pertenece al mismo tenant
    if (user.tenantId !== currentUser.tenantId) {
      return NextResponse.json({ error: 'Sin permiso para ver este usuario' }, { status: 403 });
    }

    // Excluir contraseña
    const { password, ...userWithoutPassword } = user;

    return NextResponse.json(userWithoutPassword);
  } catch (error: any) {
    console.error('Error al obtener usuario:', error);
    return NextResponse.json({ error: 'Error al obtener usuario' }, { status: 500 });
  }
}

// PATCH /api/users/[id] - Actualizar usuario
export async function PATCH(
  req: NextRequest,
  { params: paramsPromise }: { params: Promise<{ id: string }> }
) {
  const params = await paramsPromise;
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

    const targetUser = await prisma.user.findUnique({
      where: { id: params.id },
      include: { role: true },
    });

    if (!targetUser) {
      return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 });
    }

    // Verificar permisos
    if (!canManageUser(currentUser, targetUser) && currentUser.id !== targetUser.id) {
      return NextResponse.json({ error: 'Sin permiso para editar este usuario' }, { status: 403 });
    }

    const body = await req.json();
    const { name, telefono, timezone, roleId, estado, image } = body;

    // Preparar datos de actualización
    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (telefono !== undefined) updateData.telefono = telefono;
    if (timezone !== undefined) updateData.timezone = timezone;
    if (image !== undefined) updateData.image = image;

    // Solo admin puede cambiar rol y estado
    if (hasPermission(currentUser, 'equipo', 'editar')) {
      if (roleId !== undefined) {
        // Verificar que el rol pertenece al mismo tenant
        const role = await prisma.role.findUnique({
          where: { id: roleId },
        });

        if (!role || role.tenantId !== currentUser.tenantId) {
          return NextResponse.json({ error: 'Rol inválido' }, { status: 400 });
        }

        updateData.roleId = roleId;
      }
      if (estado !== undefined) updateData.estado = estado;
    }

    // Actualizar usuario
    const updatedUser = await prisma.user.update({
      where: { id: params.id },
      data: updateData,
      include: {
        role: {
          select: {
            id: true,
            nombre: true,
            descripcion: true,
          },
        },
      },
    });

    // Registrar en audit log
    if (currentUser.tenantId) {
      await logAuditAction(
        currentUser.id,
        currentUser.tenantId,
        'actualizar',
        'usuario',
        updatedUser.id,
        `${currentUser.name} actualizó el usuario ${updatedUser.name}`,
        targetUser,
        updatedUser
      );
    }

    // Excluir contraseña
    const { password, ...userWithoutPassword } = updatedUser;

    return NextResponse.json(userWithoutPassword);
  } catch (error: any) {
    console.error('Error al actualizar usuario:', error);
    return NextResponse.json({ error: 'Error al actualizar usuario' }, { status: 500 });
  }
}

// DELETE /api/users/[id] - Eliminar usuario
export async function DELETE(
  req: NextRequest,
  { params: paramsPromise }: { params: Promise<{ id: string }> }
) {
  const params = await paramsPromise;
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

    // Verificar permiso
    if (!hasPermission(currentUser, 'equipo', 'eliminar')) {
      return NextResponse.json({ error: 'Sin permiso para eliminar usuarios' }, { status: 403 });
    }

    const targetUser = await prisma.user.findUnique({
      where: { id: params.id },
    });

    if (!targetUser) {
      return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 });
    }

    // No se puede eliminar a sí mismo
    if (targetUser.id === currentUser.id) {
      return NextResponse.json({ error: 'No puedes eliminarte a ti mismo' }, { status: 400 });
    }

    // Verificar que el usuario pertenece al mismo tenant
    if (targetUser.tenantId !== currentUser.tenantId) {
      return NextResponse.json({ error: 'Sin permiso para eliminar este usuario' }, { status: 403 });
    }

    // Eliminar usuario
    await prisma.user.delete({
      where: { id: params.id },
    });

    // Registrar en audit log
    if (currentUser.tenantId) {
      await logAuditAction(
        currentUser.id,
        currentUser.tenantId,
        'eliminar',
        'usuario',
        params.id,
        `${currentUser.name} eliminó al usuario ${targetUser.name} (${targetUser.email})`
      );
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error al eliminar usuario:', error);
    return NextResponse.json({ error: 'Error al eliminar usuario' }, { status: 500 });
  }
}
