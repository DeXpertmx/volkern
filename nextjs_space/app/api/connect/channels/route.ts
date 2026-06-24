export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withTenantAuth } from '@/lib/api-key-auth';
import { ConnectService } from '@/lib/connect/connect-service';

/**
 * GET /api/connect/channels - Listar canales del usuario actual
 */
export const GET = withTenantAuth(async (request, auth) => {
  try {
    const tenantId = auth.tenant!.id;
    const userId = auth.user!.id;

    // Asegurarse de que el canal General existe y el usuario está suscrito
    await ConnectService.ensureGeneralChannel(tenantId, userId);

    const subscriptions = await prisma.chatSubscription.findMany({
      where: {
        userId,
        tenantId
      },
      include: {
        channel: true
      },
      orderBy: { isPinned: 'desc' }
    });

    // Simplificamos la consulta de unread count por ahora para evitar subqueries complejas en el include
    const channelsWithMetadata = await Promise.all(subscriptions.map(async (sub) => {
      const unreadCount = await prisma.chatMessage.count({
        where: {
          channelId: sub.channelId,
          createdAt: { gt: sub.lastReadAt },
          senderId: { not: userId }
        }
      });

      const lastMessage = await prisma.chatMessage.findFirst({
        where: { channelId: sub.channelId },
        orderBy: { createdAt: 'desc' },
        select: { content: true, createdAt: true, senderId: true }
      });

      return {
        ...sub.channel,
        lastReadAt: sub.lastReadAt,
        isPinned: sub.isPinned,
        unreadCount,
        lastMessage
      };
    }));

    return NextResponse.json(channelsWithMetadata);
  } catch (error) {
    console.error('[ConnectAPI] Error fatal cargando canales:', error);
    return NextResponse.json({ 
      error: 'Error al cargar canales',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
});

/**
 * POST /api/connect/channels - Crear nuevo canal
 */
export const POST = withTenantAuth(async (request, auth) => {
  try {
    const tenantId = auth.tenant!.id;
    const userId = auth.user!.id;
    const body = await request.json();

    if (!body.name) {
      return NextResponse.json({ error: 'El nombre del canal es obligatorio' }, { status: 400 });
    }

    // RBAC: Solo Admin, Owner, Operator o Superadmin pueden crear canales
    const allowedRoles = ['Admin', 'Owner', 'Operator', 'Superadmin'];
    const userRole = auth.user?.role?.nombre;
    
    if (!allowedRoles.includes(userRole || '')) {
      return NextResponse.json({ error: 'No tienes permisos para crear canales' }, { status: 403 });
    }

    const channel = await prisma.$transaction(async (tx) => {
      const newChannel = await tx.chatChannel.create({
        data: {
          tenantId,
          name: body.name,
          type: body.type || 'public'
        }
      });

      // Suscribir al creador
      await tx.chatSubscription.create({
        data: {
          tenantId,
          userId,
          channelId: newChannel.id
        }
      });

      // Si es público y se requiere, suscribir a otros (opcional en el body)
      if (body.userIds && Array.isArray(body.userIds)) {
        const otherSubs = (body.userIds as string[])
          .filter((id: string) => id !== userId)
          .map((id: string) => ({
            tenantId,
            userId: id,
            channelId: newChannel.id
          }));
        
        if (otherSubs.length > 0) {
          await tx.chatSubscription.createMany({ data: otherSubs });
        }
      }

      return newChannel;
    });

    return NextResponse.json(channel);
  } catch (error) {
    console.error('Error creating channel:', error);
    return NextResponse.json({ error: 'Error al crear canal' }, { status: 500 });
  }
});
