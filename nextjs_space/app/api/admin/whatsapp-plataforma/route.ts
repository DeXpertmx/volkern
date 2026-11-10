export const dynamic = 'force-dynamic';

/**
 * GET/POST/DELETE /api/admin/whatsapp-plataforma
 * Gestión de la instancia de WhatsApp de la PLATAFORMA (número oficial de
 * Volkern) usado para notificaciones cuando un tenant no tiene conectado su
 * propio WhatsApp. Acceso restringido a operadores Superadmin de la plataforma.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/db';
import {
  createPlatformInstance,
  deletePlatformInstance,
  getPlatformInstance,
  refreshPlatformPhoneNumber,
  PLATFORM_INSTANCE_ROW_ID,
} from '@/lib/evolution-instances';

/** Solo el Superadmin de la plataforma puede gestionar el WhatsApp oficial. */
async function requirePlatformAdmin(): Promise<NextResponse | null> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { email: true, role: { select: { nombre: true } } },
  });
  if (user?.role?.nombre !== 'Superadmin') {
    return NextResponse.json({ error: 'Solo operadores Superadmin de la plataforma' }, { status: 403 });
  }
  return null;
}

/** GET - Obtener la instancia de WhatsApp de la plataforma. */
export async function GET() {
  try {
    const denied = await requirePlatformAdmin();
    if (denied) return denied;

    const { instance, error } = await getPlatformInstance();

    // Auto-reparación: si la instancia está conectada pero perdió el número
    // (o se conectó con un payload sin dueño), se recupera al abrir el panel.
    if (instance && instance.status === 'connected' && !instance.phoneNumber) {
      const recuperado = await refreshPlatformPhoneNumber().catch(() => null);
      if (recuperado) instance.phoneNumber = recuperado;
    }

    if (!instance) {
      return NextResponse.json({
        connected: false,
        message: error || 'La plataforma no tiene un WhatsApp configurado',
      });
    }

    let qrExpired = false;
    if (instance.qrCodeExpiry) {
      qrExpired = new Date(instance.qrCodeExpiry) < new Date();
    }

    return NextResponse.json({
      connected: instance.status === 'connected',
      instance: { ...instance, qrExpired },
    });
  } catch (error) {
    console.error('Error al obtener WhatsApp de la plataforma:', error);
    return NextResponse.json({ error: 'Error al obtener WhatsApp de la plataforma' }, { status: 500 });
  }
}

/** POST - Crear la instancia de WhatsApp de la plataforma y devolver el QR. */
export async function POST() {
  try {
    const denied = await requirePlatformAdmin();
    if (denied) return denied;

    const result = await createPlatformInstance();

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      message: 'WhatsApp de la plataforma creado. Escanea el QR para conectarlo.',
      instance: result.instance,
    });
  } catch (error) {
    console.error('Error al crear WhatsApp de la plataforma:', error);
    return NextResponse.json({ error: 'Error al crear WhatsApp de la plataforma' }, { status: 500 });
  }
}

/** DELETE - Desconectar y eliminar la instancia de WhatsApp de la plataforma. */
export async function DELETE() {
  try {
    const denied = await requirePlatformAdmin();
    if (denied) return denied;

    const result = await deletePlatformInstance();

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      message: 'WhatsApp de la plataforma desconectado exitosamente',
    });
  } catch (error) {
    console.error('Error al eliminar WhatsApp de la plataforma:', error);
    return NextResponse.json({ error: 'Error al eliminar WhatsApp de la plataforma' }, { status: 500 });
  }
}
