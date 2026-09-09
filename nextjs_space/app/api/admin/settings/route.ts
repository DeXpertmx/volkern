export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/db';

// GET /api/admin/settings - Get platform settings
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session || !session.user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    // Check if user is superadmin
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      include: { role: true }
    });

    if (!user || user.role?.nombre !== 'Superadmin') {
      return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 });
    }

    // Lectura pura: si no existen settings, devolver null (el PATCH crea la fila
    // al primer guardado). La creación ya no ocurre dentro de una petición GET.
    const settings = await prisma.platformSettings.findFirst();

    if (!settings) {
      return NextResponse.json(null);
    }

    // Mask sensitive data
    const sanitizedSettings = {
      ...settings,
      stripePublicKey: settings.stripePublicKey ? '****' : null,
      stripePriceKey: settings.stripePriceKey ? '****' : null,
      twilioAccountSid: settings.twilioAccountSid ? '****' : null,
      twilioAuthToken: settings.twilioAuthToken ? '****' : null,
      dialog360ApiKey: settings.dialog360ApiKey ? '****' : null,
      resendApiKey: settings.resendApiKey ? '****' : null
    };

    return NextResponse.json(sanitizedSettings);

  } catch (error: any) {
    console.error('Error fetching settings:', error);
    return NextResponse.json(
      { error: 'Error al obtener configuración' },
      { status: 500 }
    );
  }
}

// PATCH /api/admin/settings - Update platform settings
export async function PATCH(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session || !session.user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    // Check if user is superadmin
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      include: { role: true }
    });

    if (!user || user.role?.nombre !== 'Superadmin') {
      return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 });
    }

    const body = await req.json();

    let settings = await prisma.platformSettings.findFirst();

    if (!settings) {
      settings = await prisma.platformSettings.create({
        data: body
      });
    } else {
      settings = await prisma.platformSettings.update({
        where: { id: settings.id },
        data: body
      });
    }

    // Log audit
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        accion: 'actualizar',
        entidad: 'platform_settings',
        entidadId: settings.id,
        descripcion: 'Configuración global actualizada'
      }
    });

    // Mask sensitive data in response
    const sanitizedSettings = {
      ...settings,
      stripePublicKey: settings.stripePublicKey ? '****' : null,
      stripePriceKey: settings.stripePriceKey ? '****' : null,
      twilioAccountSid: settings.twilioAccountSid ? '****' : null,
      twilioAuthToken: settings.twilioAuthToken ? '****' : null,
      dialog360ApiKey: settings.dialog360ApiKey ? '****' : null,
      resendApiKey: settings.resendApiKey ? '****' : null
    };

    return NextResponse.json(sanitizedSettings);

  } catch (error: any) {
    console.error('Error updating settings:', error);
    return NextResponse.json(
      { error: 'Error al actualizar configuración' },
      { status: 500 }
    );
  }
}
