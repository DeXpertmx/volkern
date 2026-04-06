export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/db';
import {

  connectToExistingInstance,
  deleteInstance,
  getUserInstance
} from '@/lib/evolution-instances';

/**
 * GET - Obtener instancia de WhatsApp del usuario actual
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

    // Buscar instancia del usuario
    const instance = await prisma.userWhatsAppInstance.findFirst({
      where: {
        userId: user.id,
        tenantId: user.tenantId
      },
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
        message: 'No tienes una instancia de WhatsApp conectada'
      });
    }

    // Verificar si el QR expiró
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
    console.error('Error al obtener instancia de WhatsApp:', error);
    return NextResponse.json(
      { error: 'Error al obtener instancia de WhatsApp' },
      { status: 500 }
    );
  }
}

/**
 * POST - Conectar a una instancia EXISTENTE de WhatsApp
 * El usuario debe proporcionar el nombre de la instancia que creó manualmente en Evolution API
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { id: true, tenantId: true, name: true }
    });

    if (!user?.tenantId) {
      return NextResponse.json({ error: 'Usuario sin tenant' }, { status: 400 });
    }

    // Obtener el nombre de instancia del body
    const body = await request.json();
    const { instanceName } = body;

    if (!instanceName) {
      return NextResponse.json(
        { error: 'Por favor proporciona el nombre de la instancia' },
        { status: 400 }
      );
    }

    // Conectar a instancia existente
    const result = await connectToExistingInstance(user.id, user.tenantId, instanceName);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Conectado exitosamente a la instancia de WhatsApp',
      instance: result.instance
    });
  } catch (error) {
    console.error('Error al conectar a instancia de WhatsApp:', error);
    return NextResponse.json(
      { error: 'Error al conectar a instancia de WhatsApp' },
      { status: 500 }
    );
  }
}

/**
 * DELETE - Eliminar instancia de WhatsApp del usuario
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

    // Eliminar instancia
    const result = await deleteInstance(user.id, user.tenantId);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Instancia eliminada exitosamente'
    });
  } catch (error) {
    console.error('Error al eliminar instancia de WhatsApp:', error);
    return NextResponse.json(
      { error: 'Error al eliminar instancia de WhatsApp' },
      { status: 500 }
    );
  }
}
