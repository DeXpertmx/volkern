export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

/**
 * GET /api/webhooks/outgoing/[id]/deliveries
 * Obtiene el historial de entregas de un webhook
 */
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

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    });

    if (!user || !user.tenantId) {
      return NextResponse.json({ error: 'Usuario sin tenant' }, { status: 400 });
    }

    // Verificar que el webhook existe y pertenece al tenant
    const webhook = await prisma.outgoingWebhook.findFirst({
      where: {
        id: params.id,
        tenantId: user.tenantId,
      },
    });

    if (!webhook) {
      return NextResponse.json({ error: 'Webhook no encontrado' }, { status: 404 });
    }

    // Paginación
    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');
    const skip = (page - 1) * limit;

    // Obtener deliveries
    const [deliveries, total] = await Promise.all([
      prisma.outgoingWebhookDelivery.findMany({
        where: { webhookId: params.id },
        orderBy: { fechaEnvio: 'desc' },
        take: limit,
        skip,
      }),
      prisma.outgoingWebhookDelivery.count({
        where: { webhookId: params.id },
      }),
    ]);

    return NextResponse.json({
      deliveries,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error: any) {
    console.error('[API] Error al obtener deliveries:', error);
    return NextResponse.json(
      { error: 'Error al obtener deliveries' },
      { status: 500 }
    );
  }
}
