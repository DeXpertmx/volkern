export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/db';
import {
  createTenantInstance,
  deleteTenantInstance,
} from '@/lib/evolution-instances';

/**
 * GET - Obtener la instancia de WhatsApp del NEGOCIO (tenant).
 * Es un número dedicado del negocio para el chatbot y el equipo, separado de
 * los WhatsApp personales de los usuarios.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { id: true, tenantId: true }
    });

    if (!user?.tenantId) {
      return NextResponse.json({ error: 'Usuario sin tenant' }, { status: 400 });
    }

    const instance = await prisma.tenantWhatsAppInstance.findUnique({
      where: { tenantId: user.tenantId },
      select: {
        id: true,
        instanceName: true,
        phoneNumber: true,
        status: true,
        profileName: true,
        profilePicUrl: true,
        totalMensajes: true,
        ultimoMensaje: true,
        fechaConexion: true,
        fechaCreacion: true,
        qrCode: true,
        qrCodeExpiry: true
      }
    });

    if (!instance) {
      return NextResponse.json({
        connected: false,
        message: 'El negocio no tiene un WhatsApp conectado'
      });
    }

    let qrExpired = false;
    if (instance.qrCodeExpiry) {
      qrExpired = new Date(instance.qrCodeExpiry) < new Date();
    }

    return NextResponse.json({
      connected: true,
      instance: {
        ...instance,
        qrExpired
      }
    });
  } catch (error) {
    console.error('Error al obtener WhatsApp del negocio:', error);
    return NextResponse.json(
      { error: 'Error al obtener WhatsApp del negocio' },
      { status: 500 }
    );
  }
}

/**
 * POST - Crear la instancia de WhatsApp del negocio (tenant) desde Volkern.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { id: true, tenantId: true }
    });

    if (!user?.tenantId) {
      return NextResponse.json({ error: 'Usuario sin tenant' }, { status: 400 });
    }

    const result = await createTenantInstance(user.tenantId);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'WhatsApp del negocio creado. Escanea el QR para conectarlo.',
      instance: result.instance
    });
  } catch (error) {
    console.error('Error al crear WhatsApp del negocio:', error);
    return NextResponse.json(
      { error: 'Error al crear WhatsApp del negocio' },
      { status: 500 }
    );
  }
}

/**
 * DELETE - Eliminar la instancia de WhatsApp del negocio (tenant).
 */
export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { id: true, tenantId: true }
    });

    if (!user?.tenantId) {
      return NextResponse.json({ error: 'Usuario sin tenant' }, { status: 400 });
    }

    const result = await deleteTenantInstance(user.tenantId);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'WhatsApp del negocio desconectado exitosamente'
    });
  } catch (error) {
    console.error('Error al eliminar WhatsApp del negocio:', error);
    return NextResponse.json(
      { error: 'Error al eliminar WhatsApp del negocio' },
      { status: 500 }
    );
  }
}
