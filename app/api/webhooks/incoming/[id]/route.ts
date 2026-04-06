export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import crypto from 'crypto';

// GET - Obtener detalles de un webhook específico
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
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

    const webhook = await prisma.incomingWebhook.findFirst({
      where: {
        id: params.id,
        tenantId: user.tenantId
      },
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
      }
    });

    if (!webhook) {
      return NextResponse.json(
        { error: 'Webhook no encontrado' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      webhook: {
        ...webhook,
        url: `${process.env.NEXTAUTH_URL || 'https://volkern.app'}/api/webhook/${webhook.id}`,
        totalEntregas: webhook._count.entregas
      }
    });

  } catch (error: any) {
    console.error('Error obteniendo webhook:', error);
    return NextResponse.json(
      { error: 'Error al obtener webhook' },
      { status: 500 }
    );
  }
}

// PUT - Actualizar webhook
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
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
    const existingWebhook = await prisma.incomingWebhook.findFirst({
      where: {
        id: params.id,
        tenantId: user.tenantId
      }
    });

    if (!existingWebhook) {
      return NextResponse.json(
        { error: 'Webhook no encontrado' },
        { status: 404 }
      );
    }

    const body = await request.json();
    const {
      nombre,
      descripcion,
      activo,
      accion,
      mapeoNombre,
      mapeoEmail,
      mapeoTelefono,
      mapeoEmpresa,
      mapeoNotas,
      mapeoCustom,
      automationId,
      regenerarSecret
    } = body;

    // Preparar datos de actualización
    const updateData: any = {};

    if (nombre !== undefined) updateData.nombre = nombre;
    if (descripcion !== undefined) updateData.descripcion = descripcion;
    if (activo !== undefined) updateData.activo = activo;
    if (accion !== undefined) updateData.accion = accion;
    if (mapeoNombre !== undefined) updateData.mapeoNombre = mapeoNombre;
    if (mapeoEmail !== undefined) updateData.mapeoEmail = mapeoEmail;
    if (mapeoTelefono !== undefined) updateData.mapeoTelefono = mapeoTelefono;
    if (mapeoEmpresa !== undefined) updateData.mapeoEmpresa = mapeoEmpresa;
    if (mapeoNotas !== undefined) updateData.mapeoNotas = mapeoNotas;
    if (mapeoCustom !== undefined) updateData.mapeoCustom = mapeoCustom;
    if (automationId !== undefined) updateData.automationId = automationId;

    // Regenerar secret si se solicitó
    if (regenerarSecret) {
      updateData.secretKey = crypto.randomBytes(32).toString('hex');
    }

    // Actualizar webhook
    const webhook = await prisma.incomingWebhook.update({
      where: { id: params.id },
      data: updateData,
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
        accion: 'actualizar',
        entidad: 'incoming_webhook',
        entidadId: webhook.id,
        descripcion: `Webhook actualizado: ${webhook.nombre}`
      }
    });

    return NextResponse.json({
      success: true,
      webhook: {
        ...webhook,
        url: `${process.env.NEXTAUTH_URL || 'https://volkern.app'}/api/webhook/${webhook.id}`
      }
    });

  } catch (error: any) {
    console.error('Error actualizando webhook:', error);
    return NextResponse.json(
      { error: 'Error al actualizar webhook', details: error.message },
      { status: 500 }
    );
  }
}

// DELETE - Eliminar webhook
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
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

    // Eliminar webhook (las entregas se eliminan en cascada)
    await prisma.incomingWebhook.delete({
      where: { id: params.id }
    });

    // Registrar en audit log
    await prisma.auditLog.create({
      data: {
        tenantId: user.tenantId,
        userId: user.id,
        accion: 'eliminar',
        entidad: 'incoming_webhook',
        entidadId: webhook.id,
        descripcion: `Webhook eliminado: ${webhook.nombre}`
      }
    });

    return NextResponse.json({
      success: true,
      message: 'Webhook eliminado correctamente'
    });

  } catch (error: any) {
    console.error('Error eliminando webhook:', error);
    return NextResponse.json(
      { error: 'Error al eliminar webhook', details: error.message },
      { status: 500 }
    );
  }
}
