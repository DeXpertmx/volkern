export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/db';

const HUB_BASE_URL = process.env.CHATWOOT_BASE_URL || '';

/**
 * GET - Listar entregas fallidas de WhatsApp del tenant (conversaciones
 * marcadas como no entregables cuando Evolution responde 400).
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { id: true, tenantId: true, name: true, email: true }
    });

    if (!user?.tenantId) {
      return NextResponse.json({ error: 'Usuario sin tenant' }, { status: 400 });
    }

    const url = new URL(request.url);
    const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '50', 10) || 50, 1), 200);
    const estado = url.searchParams.get('estado') || undefined;

    const failures = await prisma.whatsAppDeliveryFailure.findMany({
      where: {
        tenantId: user.tenantId,
        ...(estado ? { estado } : {}),
      },
      orderBy: { fechaCreacion: 'desc' },
      take: limit,
    });

    // Enlace directo a la conversación en el hub (white-label), si hay URL.
    const hubUrl = HUB_BASE_URL || null;

    return NextResponse.json({
      failures: failures.map((f) => ({
        id: f.id,
        chatwootAccountId: f.chatwootAccountId,
        chatwootConversationId: f.chatwootConversationId,
        contactoNombre: f.contactoNombre,
        telefono: f.telefono,
        emailContacto: f.emailContacto,
        empresa: f.empresa,
        mensajeFallido: f.mensajeFallido,
        notaAgente: f.notaAgente,
        estado: f.estado,
        resueltoPor: f.resueltoPor,
        fechaResolucion: f.fechaResolucion,
        fechaCreacion: f.fechaCreacion,
        hubUrl: hubUrl
          ? `${hubUrl}/accounts/${f.chatwootAccountId}/conversations/${f.chatwootConversationId}`
          : null,
      })),
    });
  } catch (error) {
    console.error('Error al listar entregas no entregables:', error);
    return NextResponse.json(
      { error: 'Error al listar entregas no entregables' },
      { status: 500 }
    );
  }
}

/**
 * PATCH - Marcar una entrega fallida como resuelta.
 * Body: { id: string } (o ids: string[])
 */
export async function PATCH(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { id: true, tenantId: true, name: true, email: true }
    });

    if (!user?.tenantId) {
      return NextResponse.json({ error: 'Usuario sin tenant' }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const ids = Array.isArray(body.ids)
      ? body.ids.filter((x: unknown) => typeof x === 'string')
      : typeof body.id === 'string'
        ? [body.id]
        : [];

    if (ids.length === 0) {
      return NextResponse.json({ error: 'Se requiere el id de la entrega fallida' }, { status: 400 });
    }

    const resueltoPor = user.name || user.email || user.id;

    const result = await prisma.whatsAppDeliveryFailure.updateMany({
      where: {
        id: { in: ids },
        tenantId: user.tenantId,
      },
      data: {
        estado: 'resuelto',
        resueltoPor,
        fechaResolucion: new Date(),
      },
    });

    return NextResponse.json({ success: true, updated: result.count });
  } catch (error) {
    console.error('Error al resolver entrega fallida:', error);
    return NextResponse.json(
      { error: 'Error al resolver entrega fallida' },
      { status: 500 }
    );
  }
}
