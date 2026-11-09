export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import crypto from 'crypto';

/**
 * GET /api/webhooks/outgoing/[id]
 * Obtiene los detalles de un webhook específico
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

    const webhook = await prisma.outgoingWebhook.findFirst({
      where: {
        id: params.id,
        tenantId: user.tenantId,
      },
      include: {
        user: {
          select: {
            name: true,
            email: true,
          },
        },
        _count: {
          select: {
            deliveries: true,
          },
        },
      },
    });

    if (!webhook) {
      return NextResponse.json({ error: 'Webhook no encontrado' }, { status: 404 });
    }

    return NextResponse.json({ webhook });
  } catch (error: any) {
    console.error('[API] Error al obtener webhook saliente:', error);
    return NextResponse.json(
      { error: 'Error al obtener webhook' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/webhooks/outgoing/[id]
 * Actualiza un webhook saliente
 */
export async function PUT(
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
    const webhookExistente = await prisma.outgoingWebhook.findFirst({
      where: {
        id: params.id,
        tenantId: user.tenantId,
      },
    });

    if (!webhookExistente) {
      return NextResponse.json({ error: 'Webhook no encontrado' }, { status: 404 });
    }

    const body = await req.json();
    const {
      nombre,
      descripcion,
      url,
      activo,
      eventos,
      metodoHttp,
      headers,
      regenerarSecret,
      maxReintentos,
      timeoutSegundos,
    } = body;

    // Validar URL si se proporciona
    if (url) {
      try {
        new URL(url);
      } catch {
        return NextResponse.json({ error: 'URL inválida' }, { status: 400 });
      }
    }

    // Regenerar secretKey si se solicita
    const secretKey = regenerarSecret
      ? crypto.randomBytes(32).toString('hex')
      : undefined;

    // Actualizar webhook
    const webhook = await prisma.outgoingWebhook.update({
      where: { id: params.id },
      data: {
        ...(nombre && { nombre }),
        ...(descripcion !== undefined && { descripcion }),
        ...(url && { url }),
        ...(activo !== undefined && { activo }),
        ...(eventos && { eventos: eventos as any }),
        ...(metodoHttp && { metodoHttp }),
        ...(headers !== undefined && { headers: headers || null }),
        ...(secretKey && { secretKey }),
        ...(maxReintentos !== undefined && { maxReintentos }),
        ...(timeoutSegundos !== undefined && { timeoutSegundos }),
      },
    });

    // Registrar en audit log
    await prisma.auditLog.create({
      data: {
        tenantId: user.tenantId,
        userId: user.id,
        accion: 'actualizar_webhook_saliente',
        entidad: 'outgoing_webhook',
        entidadId: webhook.id,
        descripcion: `Webhook saliente actualizado: ${webhook.nombre}`,
        cambiosDespues: body as any,
      },
    });

    return NextResponse.json({ webhook });
  } catch (error: any) {
    console.error('[API] Error al actualizar webhook saliente:', error);
    return NextResponse.json(
      { error: 'Error al actualizar webhook' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/webhooks/outgoing/[id]
 * Elimina un webhook saliente
 */
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

    // Eliminar webhook (cascade eliminará deliveries)
    await prisma.outgoingWebhook.delete({
      where: { id: params.id },
    });

    // Registrar en audit log
    await prisma.auditLog.create({
      data: {
        tenantId: user.tenantId,
        userId: user.id,
        accion: 'eliminar_webhook_saliente',
        entidad: 'outgoing_webhook',
        entidadId: webhook.id,
        descripcion: `Webhook saliente eliminado: ${webhook.nombre}`,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[API] Error al eliminar webhook saliente:', error);
    return NextResponse.json(
      { error: 'Error al eliminar webhook' },
      { status: 500 }
    );
  }
}
