export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import crypto from 'crypto';

/**
 * GET /api/webhooks/outgoing
 * Lista todos los webhooks salientes del tenant
 */
export async function GET(req: NextRequest) {
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

    // Obtener todos los webhooks del tenant con estadísticas
    const webhooks = await prisma.outgoingWebhook.findMany({
      where: { tenantId: user.tenantId },
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
      orderBy: { fechaCreacion: 'desc' },
    });

    const webhooksFormatted = webhooks.map((webhook) => ({
      id: webhook.id,
      nombre: webhook.nombre,
      descripcion: webhook.descripcion,
      url: webhook.url,
      activo: webhook.activo,
      eventos: webhook.eventos,
      metodoHttp: webhook.metodoHttp,
      totalEnviados: webhook.totalEnviados,
      totalExitosos: webhook.totalExitosos,
      totalFallidos: webhook.totalFallidos,
      ultimoEnvio: webhook.ultimoEnvio,
      fechaCreacion: webhook.fechaCreacion,
      creadoPor: webhook.user,
      totalDeliveries: webhook._count.deliveries,
    }));

    return NextResponse.json({ webhooks: webhooksFormatted });
  } catch (error: any) {
    console.error('[API] Error al obtener webhooks salientes:', error);
    return NextResponse.json(
      { error: 'Error al obtener webhooks' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/webhooks/outgoing
 * Crea un nuevo webhook saliente
 */
export async function POST(req: NextRequest) {
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

    const body = await req.json();
    const {
      nombre,
      descripcion,
      url,
      eventos,
      metodoHttp,
      headers,
      generarSecret,
      maxReintentos,
      timeoutSegundos,
    } = body;

    // Validaciones
    if (!nombre || !url || !Array.isArray(eventos) || eventos.length === 0) {
      return NextResponse.json(
        { error: 'Nombre, URL y eventos son requeridos' },
        { status: 400 }
      );
    }

    // Validar URL
    try {
      new URL(url);
    } catch {
      return NextResponse.json({ error: 'URL inválida' }, { status: 400 });
    }

    // Generar secretKey si se solicita
    const secretKey = generarSecret
      ? crypto.randomBytes(32).toString('hex')
      : null;

    // Crear webhook
    const webhook = await prisma.outgoingWebhook.create({
      data: {
        tenantId: user.tenantId,
        userId: user.id,
        nombre,
        descripcion,
        url,
        eventos: eventos as any,
        metodoHttp: metodoHttp || 'POST',
        headers: headers || null,
        secretKey,
        maxReintentos: maxReintentos || 3,
        timeoutSegundos: timeoutSegundos || 30,
        activo: true,
      },
    });

    // Registrar en audit log
    await prisma.auditLog.create({
      data: {
        tenantId: user.tenantId,
        userId: user.id,
        accion: 'crear_webhook_saliente',
        entidad: 'outgoing_webhook',
        entidadId: webhook.id,
        descripcion: `Webhook saliente creado: ${nombre} - URL: ${url}`,
        cambiosDespues: {
          url,
          eventos,
        } as any,
      },
    });

    return NextResponse.json({ webhook }, { status: 201 });
  } catch (error: any) {
    console.error('[API] Error al crear webhook saliente:', error);
    return NextResponse.json(
      { error: 'Error al crear webhook' },
      { status: 500 }
    );
  }
}
