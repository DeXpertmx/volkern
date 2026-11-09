export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { dispatchWebhook } from '@/lib/outgoing-webhooks';

/**
 * POST /api/webhooks/outgoing/[id]/test
 * Envía un webhook de prueba
 */
export async function POST(
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

    // Obtener el primer evento configurado
    const eventos = (webhook.eventos as string[]) || [];
    if (eventos.length === 0) {
      return NextResponse.json(
        { error: 'El webhook no tiene eventos configurados' },
        { status: 400 }
      );
    }

    const eventoTest = eventos[0] as any;

    // Crear un payload de prueba
    const testData = {
      test: true,
      message: 'Este es un webhook de prueba desde Volkern CRM',
      timestamp: new Date().toISOString(),
      webhook_id: webhook.id,
      webhook_name: webhook.nombre,
      event: eventoTest,
      sample_data: {
        id: 'test-123',
        nombre: 'Test Entity',
        email: 'test@example.com',
        created_at: new Date().toISOString(),
      },
    };

    // Enviar el webhook de prueba
    await dispatchWebhook(
      user.tenantId,
      eventoTest,
      testData,
      'test',
      'test-123'
    );

    return NextResponse.json({
      success: true,
      message: 'Webhook de prueba enviado',
      evento: eventoTest,
    });
  } catch (error: any) {
    console.error('[API] Error al enviar webhook de prueba:', error);
    return NextResponse.json(
      { error: 'Error al enviar webhook de prueba' },
      { status: 500 }
    );
  }
}
