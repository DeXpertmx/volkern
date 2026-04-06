export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/db';
import { checkInstanceStatus, getProfileInfo } from '@/lib/evolution-instances';

/**
 * GET - Verificar estado de conexión de WhatsApp
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

    // Verificar estado actual
    const statusResult = await checkInstanceStatus(instance.instanceName);

    if (!statusResult.success) {
      return NextResponse.json(
        { error: statusResult.error },
        { status: 400 }
      );
    }

    // Si está conectado, obtener info del perfil
    let profileInfo = null;
    if (statusResult.status === 'connected') {
      const profileResult = await getProfileInfo(instance.instanceName);
      if (profileResult.success) {
        profileInfo = profileResult.profile;
      }
    }

    // Obtener instancia actualizada
    const updatedInstance = await prisma.userWhatsAppInstance.findFirst({
      where: {
        userId: user.id,
        tenantId: user.tenantId
      }
    });

    return NextResponse.json({
      success: true,
      status: statusResult.status,
      instance: updatedInstance,
      profile: profileInfo
    });
  } catch (error) {
    console.error('Error al verificar estado de WhatsApp:', error);
    return NextResponse.json(
      { error: 'Error al verificar estado de WhatsApp' },
      { status: 500 }
    );
  }
}
