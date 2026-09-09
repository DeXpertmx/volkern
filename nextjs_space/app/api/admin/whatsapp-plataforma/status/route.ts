export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/whatsapp-plataforma/status
 * Verifica en Evolution API el estado real de la instancia de WhatsApp de la
 * PLATAFORMA y actualiza la fila local (número, perfil, estado). Solo Superadmin.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/db';
import { PLATFORM_INSTANCE_ROW_ID, refreshPlatformInstanceStatus } from '@/lib/evolution-instances';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { role: { select: { nombre: true } } },
    });
    if (user?.role?.nombre !== 'Superadmin') {
      return NextResponse.json({ error: 'Solo operadores Superadmin de la plataforma' }, { status: 403 });
    }

    const row = await prisma.platformWhatsAppInstance
      .findUnique({ where: { id: PLATFORM_INSTANCE_ROW_ID } })
      .catch(() => null);
    if (!row) {
      return NextResponse.json({ error: 'La plataforma no tiene un WhatsApp. Créalo primero.' }, { status: 404 });
    }

    const result = await refreshPlatformInstanceStatus();
    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      status: result.status,
      instance: result.instance,
    });
  } catch (error) {
    console.error('Error al verificar estado de WhatsApp de la plataforma:', error);
    return NextResponse.json({ error: 'Error al verificar estado' }, { status: 500 });
  }
}
