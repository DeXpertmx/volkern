export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/db';
import { getQRCode } from '@/lib/evolution-instances';

/**
 * GET - Obtener QR Code para conexión de WhatsApp
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

    // Buscar instancia del usuario
    const instance = await prisma.userWhatsAppInstance.findFirst({
      where: {
        userId: user.id,
        tenantId: user.tenantId
      }
    });

    if (!instance) {
      return NextResponse.json(
        { error: 'No se encontró instancia de WhatsApp' },
        { status: 404 }
      );
    }

    // Si la instancia ya está conectada, no necesita QR
    if (instance.status === 'connected') {
      return NextResponse.json({
        success: true,
        connected: true,
        message: 'WhatsApp ya está conectado'
      });
    }

    // Obtener QR Code actualizado
    const result = await getQRCode(instance.instanceName);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      connected: false,
      qrCode: result.qrCode
    });
  } catch (error) {
    console.error('Error al obtener QR Code:', error);
    return NextResponse.json(
      { error: 'Error al obtener QR Code' },
      { status: 500 }
    );
  }
}
