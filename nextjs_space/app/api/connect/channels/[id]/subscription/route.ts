export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withTenantAuth } from '@/lib/api-key-auth';

/**
 * PATCH /api/connect/channels/[id]/subscription - Actualizar mi suscripción (Pin, etc)
 */
export const PATCH = withTenantAuth(async (request, auth, { params }) => {
  try {
    const { id: channelId } = params;
    const tenantId = auth.tenant!.id;
    const userId = auth.user!.id;
    const body = await request.json();

    // 1. Verificar que el canal existe
    const channel = await prisma.chatChannel.findUnique({
      where: { id: channelId, tenantId }
    });

    if (!channel) {
      return NextResponse.json({ error: 'Canal no encontrado' }, { status: 404 });
    }

    // 2. Actualizar suscripción
    const subscription = await prisma.chatSubscription.update({
      where: {
        userId_channelId: {
          userId,
          channelId
        }
      },
      data: {
        isPinned: typeof body.isPinned === 'boolean' ? body.isPinned : undefined,
        lastReadAt: body.markAsRead ? new Date() : undefined
      }
    });

    return NextResponse.json(subscription);
  } catch (error) {
    console.error('Error updating channel subscription:', error);
    return NextResponse.json({ error: 'Error al actualizar suscripción' }, { status: 500 });
  }
}, ['messaging:write']);
