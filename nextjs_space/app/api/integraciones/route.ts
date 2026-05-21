export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { logAuditAction } from '@/lib/permissions';

// GET - Obtener todas las integraciones del tenant
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email! },
      include: { tenant: true }
    });

    if (!user?.tenantId) {
      return NextResponse.json({ error: 'Usuario sin tenant' }, { status: 403 });
    }

    const integraciones = await prisma.integration.findMany({
      where: { tenantId: user.tenantId },
      orderBy: { fechaCreacion: 'desc' }
    });

    // Ocultar credenciales sensibles en la respuesta
    const integracionesSanitizadas = integraciones.map(int => ({
      ...int,
      credenciales: {
        // Solo mostrar si existen credenciales, no los valores
        configurado: Object.keys(int.credenciales as any || {}).length > 0
      }
    }));

    return NextResponse.json(integracionesSanitizadas);
  } catch (error) {
    console.error('Error al obtener integraciones:', error);
    return NextResponse.json(
      { error: 'Error al obtener integraciones' },
      { status: 500 }
    );
  }
}

// POST - Crear o actualizar una integración
export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email! },
      include: { tenant: true }
    });

    if (!user?.tenantId) {
      return NextResponse.json({ error: 'Usuario sin tenant' }, { status: 403 });
    }

    const data = await request.json();
    const { tipo, nombre, credenciales, configuracion, activo } = data;

    if (!tipo || !nombre) {
      return NextResponse.json(
        { error: 'Tipo y nombre son requeridos' },
        { status: 400 }
      );
    }

    // Validar credenciales según el tipo de integración
    const credencialesValidas = validarCredenciales(tipo, credenciales);
    if (!credencialesValidas.valido) {
      return NextResponse.json(
        { error: credencialesValidas.mensaje },
        { status: 400 }
      );
    }

    // Crear o actualizar la integración
    const integracion = await prisma.integration.upsert({
      where: {
        tenantId_tipo: {
          tenantId: user.tenantId,
          tipo
        }
      },
      create: {
        tenantId: user.tenantId,
        tipo,
        nombre,
        credenciales: credenciales || {},
        configuracion: configuracion || {},
        conectado: !!credenciales,
        activo: activo ?? true
      },
      update: {
        nombre,
        credenciales: credenciales ? credenciales : undefined,
        configuracion: configuracion ? configuracion : undefined,
        conectado: !!credenciales,
        activo: activo ?? true,
        fechaActualizacion: new Date()
      }
    });

    // Registrar en audit log
    await logAuditAction(
      user.id,
      user.tenantId,
      credenciales ? 'conectar' : 'actualizar',
      'integracion',
      integracion.id,
      `Usuario ${user.name} ${credenciales ? 'conectó' : 'actualizó'} la integración ${nombre}`
    );

    return NextResponse.json({
      success: true,
      integracion: {
        ...integracion,
        credenciales: { configurado: true }
      }
    });
  } catch (error) {
    console.error('Error al guardar integración:', error);
    return NextResponse.json(
      { error: 'Error al guardar integración' },
      { status: 500 }
    );
  }
}

// Función auxiliar para validar credenciales según el tipo
function validarCredenciales(tipo: string, credenciales: any): { valido: boolean; mensaje?: string } {
  if (!credenciales) {
    return { valido: true }; // Permitir guardar sin credenciales (para editar nombre, etc.)
  }

  switch (tipo) {
    case 'twilio':
      if (!credenciales.accountSid || !credenciales.authToken) {
        return { valido: false, mensaje: 'Twilio requiere accountSid y authToken' };
      }
      break;
    case 'meta_pixel':
      if (!credenciales.pixelId) {
        return { valido: false, mensaje: 'Meta Pixel requiere pixelId' };
      }
      break;
    case 'ga4':
      if (!credenciales.measurementId) {
        return { valido: false, mensaje: 'GA4 requiere measurementId' };
      }
      break;
    case 'mailchimp':
      if (!credenciales.apiKey) {
        return { valido: false, mensaje: 'Mailchimp requiere apiKey' };
      }
      break;
    case 'brevo':
      if (!credenciales.apiKey) {
        return { valido: false, mensaje: 'Brevo requiere apiKey' };
      }
      break;
    case 'stripe':
      if (!credenciales.secretKey) {
        return { valido: false, mensaje: 'Stripe requiere secretKey' };
      }
      break;
    case 'google_calendar':
      if (!credenciales.clientId || !credenciales.clientSecret) {
        return { valido: false, mensaje: 'Google Calendar requiere clientId y clientSecret' };
      }
      break;
    case 'telegram':
      if (!credenciales.bot_token) {
        return { valido: false, mensaje: 'Telegram requiere bot_token' };
      }
      break;
    case 'meta':
      if (!credenciales.page_access_token || !credenciales.page_id) {
        return { valido: false, mensaje: 'Meta requiere page_access_token y page_id' };
      }
      break;
    case 'stripe_invoicing':
      // El de stripe_invoicing es opcional si ya está configurado stripe general
      return { valido: true };
    case 'square':
      if (!credenciales.accessToken || !credenciales.locationId) {
        return { valido: false, mensaje: 'Square requiere accessToken y locationId' };
      }
      break;
    case 'gocardless':
      if (!credenciales.accessToken) {
        return { valido: false, mensaje: 'GoCardless requiere accessToken' };
      }
      break;
  }

  return { valido: true };
}
