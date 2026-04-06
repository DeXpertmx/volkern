export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withTenantAuth } from '@/lib/api-key-auth';

/**
 * GET /api/users/me - Obtener información del usuario actual
 * Refactorizado con con withTenantAuth para soportar suplantación (Impersonate)
 */
export const GET = withTenantAuth(async (req, auth) => {
  try {
    const currentUser = auth.user!;
    const activeTenant = auth.tenant!;

    // Buscamos el detalle completo del usuario en la DB Global
    const user = await prisma.user.findUnique({
      where: { id: currentUser.id },
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        telefono: true,
        bookingSlug: true,
        bookingTitle: true,
        bookingBio: true,
        bookingEnabled: true,
        role: {
          select: {
            id: true,
            nombre: true,
            permisos: true
          }
        },
        tenant: {
          select: {
            id: true,
            nombre: true,
            slug: true
          }
        }
      }
    });

    if (!user) {
      return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 });
    }

    // SI el usuario está suplantando a un tenant (Superadmin), 
    // sobreescribimos la información del tenant en la respuesta para que la UI se actualice.
    const responseUser = {
      ...user,
      tenant: {
        id: activeTenant.id,
        nombre: activeTenant.nombre,
        slug: activeTenant.slug
      },
      // Marcar si es una sesión suplantada para lógica especial en UI si fuera necesaria
      isImpersonating: activeTenant.id !== user.tenant?.id
    };

    return NextResponse.json(responseUser);

  } catch (error: any) {
    console.error('Error fetching user:', error);
    return NextResponse.json(
      { error: 'Error al obtener información del usuario' },
      { status: 500 }
    );
  }
});

/**
 * PATCH /api/users/me - Actualizar perfil
 */
export const PATCH = withTenantAuth(async (req, auth) => {
  try {
    const currentUser = auth.user!;
    const body = await req.json();
    const { name, telefono, bookingSlug, bookingTitle, bookingBio, bookingEnabled } = body;

    // Si se está cambiando el slug, verificar que sea único en la DB Global
    if (bookingSlug) {
      const existingUser = await prisma.user.findFirst({
        where: {
          bookingSlug,
          NOT: { id: currentUser.id }
        }
      });

      if (existingUser) {
        return NextResponse.json({ error: 'Este slug ya está en uso' }, { status: 400 });
      }
    }

    const updatedUser = await prisma.user.update({
      where: { id: currentUser.id },
      data: {
        name,
        telefono,
        bookingSlug,
        bookingTitle,
        bookingBio,
        bookingEnabled: typeof bookingEnabled === 'boolean' ? bookingEnabled : undefined
      }
    });

    return NextResponse.json({ success: true, user: updatedUser });

  } catch (error: any) {
    console.error('Error updating user:', error);
    return NextResponse.json(
      { error: 'Error al actualizar información del usuario' },
      { status: 500 }
    );
  }
});
