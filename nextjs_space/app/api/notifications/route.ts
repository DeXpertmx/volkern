import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

/**
 * GET /api/notifications - Recupera las últimas notificaciones del usuario.
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  try {
    const notifications = await prisma.inAppNotification.findMany({
      where: { userId: (session.user as any).id },
      orderBy: { createdAt: 'desc' },
      take: 50 // Recuperar más para el historial
    });
    return NextResponse.json(notifications);
  } catch (error) {
    console.error('Error fetching notifications:', error);
    return NextResponse.json({ error: 'Error al recuperar notificaciones' }, { status: 500 });
  }
}

/**
 * PATCH /api/notifications - Marca notificaciones como leídas.
 */
export async function PATCH(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  try {
    const { id, all } = await req.json();

    if (all) {
      // Marcar todas como leídas
      await prisma.inAppNotification.updateMany({
        where: { 
          userId: (session.user as any).id, 
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
          userId: (session.user as any).id 
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
}
