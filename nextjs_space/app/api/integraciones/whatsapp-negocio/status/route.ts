export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/db';
import { checkInstanceStatus, getProfileInfo } from '@/lib/evolution-instances';

/**
 * GET - Verificar estado de conexión del WhatsApp del negocio (tenant).
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
      where: { tenantId: user.tenantId }
    });

    if (!instance) {
      return NextResponse.json(
        { error: 'El negocio no tiene un WhatsApp. Créalo primero.' },
        { status: 404 }
      );
    }

    const statusResult = await checkInstanceStatus(instance.instanceName);

    if (!statusResult.success) {
      return NextResponse.json(
        { error: statusResult.error },
        { status: 400 }
      );
    }

    let profileInfo = null;
    if (statusResult.status === 'connected') {
      const profileResult = await getProfileInfo(instance.instanceName);
      if (profileResult.success) {
        profileInfo = profileResult.profile;
      }
    }

    const updatedInstance = await prisma.tenantWhatsAppInstance.findUnique({
      where: { tenantId: user.tenantId }
    });

    return NextResponse.json({
      success: true,
      status: statusResult.status,
      instance: updatedInstance,
      profile: profileInfo
    });
  } catch (error) {
    console.error('Error al verificar estado de WhatsApp del negocio:', error);
    return NextResponse.json(
      { error: 'Error al verificar estado' },
      { status: 500 }
    );
  }
}
