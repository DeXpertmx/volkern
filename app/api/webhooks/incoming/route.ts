export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import crypto from 'crypto';

// GET - Listar todos los webhooks del tenant
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.email) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: { tenant: true }
    });

    if (!user?.tenantId) {
      return NextResponse.json({ error: 'Usuario sin tenant' }, { status: 403 });
    }

    // Obtener webhooks del tenant
    const webhooks = await prisma.incomingWebhook.findMany({
      where: { tenantId: user.tenantId },
      include: {
        automation: {
          select: {
            id: true,
            nombre: true,
            activo: true
          }
        },
        _count: {
          select: {
            entregas: true
          }
        }
      },
      orderBy: { fechaCreacion: 'desc' }
    });

    return NextResponse.json({
      webhooks: webhooks.map(w => ({
        ...w,
        url: `${process.env.NEXTAUTH_URL || 'https://volkern.app'}/api/webhook/${w.id}`,
        totalEntregas: w._count.entregas
      }))
    });

  } catch (error: any) {
    console.error('Error listando webhooks:', error);
    return NextResponse.json(
      { error: 'Error al listar webhooks' },
      { status: 500 }
    );
  }
}

// POST - Crear nuevo webhook
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.email) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: { tenant: true }
    });

    if (!user?.tenantId) {
      return NextResponse.json({ error: 'Usuario sin tenant' }, { status: 403 });
    }

    const body = await request.json();
    const {
      nombre,
      descripcion,
      accion,
      mapeoNombre,
      mapeoEmail,
      mapeoTelefono,
      mapeoEmpresa,
      mapeoNotas,
      mapeoCustom,
      automationId,
      generarSecret
    } = body;

    // Validaciones
    if (!nombre || !accion) {
      return NextResponse.json(
        { error: 'Nombre y acción son requeridos' },
        { status: 400 }
      );
    }

    // Si la acción es disparar_automatizacion, validar que exista el automationId
    if (accion === 'disparar_automatizacion' && !automationId) {
      return NextResponse.json(
        { error: 'Se requiere seleccionar una automatización' },
        { status: 400 }
      );
    }

    // Generar secret key si se solicitó
    let secretKey: string | undefined;
    if (generarSecret) {
      secretKey = crypto.randomBytes(32).toString('hex');
    }

    // Crear webhook
    const webhook = await prisma.incomingWebhook.create({
      data: {
        tenantId: user.tenantId,
        userId: user.id,
        nombre,
        descripcion: descripcion || undefined,
        accion,
        mapeoNombre: mapeoNombre || undefined,
        mapeoEmail: mapeoEmail || undefined,
        mapeoTelefono: mapeoTelefono || undefined,
        mapeoEmpresa: mapeoEmpresa || undefined,
        mapeoNotas: mapeoNotas || undefined,
        mapeoCustom: mapeoCustom || undefined,
        automationId: automationId || undefined,
        secretKey: secretKey || undefined,
        activo: true
      },
      include: {
        automation: {
          select: {
            id: true,
            nombre: true
          }
        }
      }
    });

    // Registrar en audit log
    await prisma.auditLog.create({
      data: {
        tenantId: user.tenantId,
        userId: user.id,
        accion: 'crear',
        entidad: 'incoming_webhook',
        entidadId: webhook.id,
        descripcion: `Webhook creado: ${nombre}`
      }
    });

    return NextResponse.json({
      success: true,
      webhook: {
        ...webhook,
        url: `${process.env.NEXTAUTH_URL || 'https://volkern.app'}/api/webhook/${webhook.id}`
      }
    }, { status: 201 });

  } catch (error: any) {
    console.error('Error creando webhook:', error);
    return NextResponse.json(
      { error: 'Error al crear webhook', details: error.message },
      { status: 500 }
    );
  }
}
