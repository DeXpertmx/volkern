export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withTenantAuth } from '@/lib/api-key-auth';
import { ConnectService } from '@/lib/connect/connect-service';

/**
 * GET /api/connect/messages - Listar mensajes de un canal con paginación por cursor
 */
export const GET = withTenantAuth(async (request, auth) => {
  try {
    const { searchParams } = new URL(request.url);
    const channelId = searchParams.get('channelId');
    const cursor = searchParams.get('cursor');
    const limit = parseInt(searchParams.get('limit') || '50');

    if (!channelId) {
      return NextResponse.json({ error: 'channelId es obligatorio' }, { status: 400 });
    }

    // Verificar membresía
    const subscription = await prisma.chatSubscription.findUnique({
      where: {
        userId_channelId: {
          userId: auth.user!.id,
          channelId
        }
      }
    });

    if (!subscription) {
      return NextResponse.json({ error: 'No tienes acceso a este canal' }, { status: 403 });
    }

    const messages = await prisma.chatMessage.findMany({
      where: {
        channelId,
        tenantId: auth.tenant!.id
      },
      take: limit,
      skip: cursor ? 1 : 0,
      cursor: cursor ? { id: cursor } : undefined,
      orderBy: { createdAt: 'desc' },
      include: {
        sender: {
          select: { id: true, name: true, image: true }
        },
        attributions: true
      }
    });

    const nextCursor = messages.length === limit ? messages[messages.length - 1].id : null;

    // Actualizar lastReadAt si estamos en la primera página
    if (!cursor) {
      await prisma.chatSubscription.update({
        where: { id: subscription.id },
        data: { lastReadAt: new Date() }
      });
    }

    return NextResponse.json({
      messages: messages.reverse(), // Devolver en orden cronológico para el UI
      nextCursor
    });
  } catch (error) {
    console.error('Error fetching messages:', error);
    return NextResponse.json({ error: 'Error al cargar mensajes' }, { status: 500 });
  }
}, ['messaging:read']);

/**
 * POST /api/connect/messages - Enviar mensaje
 */
export const POST = withTenantAuth(async (request, auth) => {
  try {
    const body = await request.json();
    const tenantId = auth.tenant!.id;
    const userId = auth.user!.id;

    if (!body.channelId || !body.content) {
      return NextResponse.json({ error: 'Datos incompletos' }, { status: 400 });
    }

    // Verificar membresía
    const subscription = await prisma.chatSubscription.findUnique({
      where: {
        userId_channelId: {
          userId,
          channelId: body.channelId
        }
      }
    });

    if (!subscription) {
      return NextResponse.json({ error: 'No tienes acceso a este canal' }, { status: 403 });
    }

    const message = await ConnectService.sendMessage({
      tenantId,
      channelId: body.channelId,
      senderId: userId,
      content: body.content,
      isSystemMessage: body.isSystemMessage,
      attributions: body.attributions
    });

    return NextResponse.json(message);
  } catch (error) {
    console.error('Error sending message:', error);
    return NextResponse.json({ error: 'Error al enviar mensaje' }, { status: 500 });
  }
}, ['messaging:send']);
