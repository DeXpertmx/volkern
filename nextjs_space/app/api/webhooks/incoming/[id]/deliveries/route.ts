export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

// GET - Obtener entregas de un webhook
export async function GET(
  request: NextRequest,
  { params: paramsPromise }: { params: Promise<{ id: string }> }
) {
  const params = await paramsPromise;
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.email) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email }
    });

    if (!user?.tenantId) {
      return NextResponse.json({ error: 'Usuario sin tenant' }, { status: 403 });
    }

    // Verificar que el webhook existe y pertenece al tenant
    const webhook = await prisma.incomingWebhook.findFirst({
      where: {
        id: params.id,
        tenantId: user.tenantId
      }
    });

    if (!webhook) {
      return NextResponse.json(
        { error: 'Webhook no encontrado' },
        { status: 404 }
      );
    }

    // Obtener parámetros de paginación
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '50');
    const skip = parseInt(searchParams.get('skip') || '0');
    const estado = searchParams.get('estado'); // exitoso, fallido

    // Construir filtro
    const where: any = {
      webhookId: params.id,
      tenantId: user.tenantId
    };

    if (estado) {
      where.estado = estado;
    }

    // Obtener entregas
    const [entregas, total] = await Promise.all([
      prisma.incomingWebhookDelivery.findMany({
        where,
        orderBy: { fechaRecepcion: 'desc' },
        take: limit,
        skip
      }),
      prisma.incomingWebhookDelivery.count({ where })
    ]);

    return NextResponse.json({
      entregas,
      pagination: {
        total,
        limit,
        skip,
        hasMore: skip + limit < total
      }
    });

  } catch (error: any) {
    console.error('Error obteniendo entregas:', error);
    return NextResponse.json(
      { error: 'Error al obtener entregas' },
      { status: 500 }
    );
  }
}
