import { NextResponse } from 'next/server';
import { withTenantAuth } from '@/lib/api-key-auth';
import { prisma } from '@/lib/db';

/**
 * GET /api/notifications - Recupera las últimas notificaciones del usuario.
 * Refactorizado con withTenantAuth para soporte de suplantación.
 */
export const GET = withTenantAuth(async (req, auth) => {
  const userId = auth.user!.id;

  try {
    const notifications = await prisma.inAppNotification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50 // Recuperar más para el historial
    });
    return NextResponse.json(notifications);
  } catch (error) {
    console.error('Error fetching notifications:', error);
    return NextResponse.json({ error: 'Error al recuperar notificaciones' }, { status: 500 });
  }
});

/**
 * PATCH /api/notifications - Marca notificaciones como leídas.
 * Refactorizado con withTenantAuth para soporte de suplantación.
 */
export const PATCH = withTenantAuth(async (req, auth) => {
  const userId = auth.user!.id;

  try {
    const { id, all } = await req.json();

    if (all) {
      // Marcar todas como leídas
      await prisma.inAppNotification.updateMany({
        where: { 
          userId, 
          read: false 
        },
        data: { 
          read: true, 
          readAt: new Date() 
        }
      });
    } else if (id) {
      // Marcar una específica
      await prisma.inAppNotification.update({
        where: { 
          id, 
          userId 
        },
        data: { 
          read: true, 
          readAt: new Date() 
        }
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating notifications:', error);
    return NextResponse.json({ error: 'Error al actualizar' }, { status: 500 });
  }
});
