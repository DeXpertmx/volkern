export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/db';
import { encrypt } from '@/lib/core/crypto';

/**
 * GET /api/integraciones/twilio
 * Obtiene el estado de la integración de Twilio SMS
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: { tenant: true },
    });

    if (!user || !user.tenantId) {
      return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 });
    }

    // Buscar integración de Twilio
    const integration = await prisma.integration.findFirst({
      where: {
        tenantId: user.tenantId,
        tipo: 'twilio',
      },
    });

    if (!integration) {
      return NextResponse.json({ configured: false });
    }

    const creds = integration.credenciales as any;

    return NextResponse.json({
      configured: true,
      integration: {
        id: integration.id,
        phoneNumber: creds?.phoneNumber || creds?.phone_number,
      },
    });
  } catch (error) {
    console.error('Error getting Twilio integration:', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}

/**
 * POST /api/integraciones/twilio
 * Conecta Twilio SMS para el tenant
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: { tenant: true },
    });

    if (!user || !user.tenantId) {
      return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 });
    }

    const data = await req.json();
    const { accountSid, authToken, phoneNumber } = data;

    if (!accountSid || !authToken) {
      return NextResponse.json(
        { error: 'Account SID y Auth Token son requeridos' },
        { status: 400 }
      );
    }

    // Verificar credenciales con Twilio
    const twilio验证 = await fetch(
      `https://api.twilio.com/2010-04-accounts/${accountSid}.json`,
      {
        headers: {
          Authorization: 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64'),
        },
      }
    );

    if (!twilio验证.ok) {
      return NextResponse.json(
        { error: 'Credenciales de Twilio inválidas' },
        { status: 400 }
      );
    }

    const twilioData = await twilio验证.json();

    // Buscar o crear integración
    let integration = await prisma.integration.findFirst({
      where: {
        tenantId: user.tenantId,
        tipo: 'twilio',
      },
    });

    if (integration) {
      // Actualizar
      integration = await prisma.integration.update({
        where: { id: integration.id },
        data: {
          nombre: 'Twilio SMS',
          credenciales: {
            account_sid: accountSid,
            auth_token: encrypt(authToken),
            phone_number: phoneNumber || '',
            phoneNumber: phoneNumber || '',
          },
          conectado: true,
        },
      });
    } else {
      // Crear
      integration = await prisma.integration.create({
        data: {
          tenantId: user.tenantId,
          tipo: 'twilio',
          nombre: 'Twilio SMS',
          credenciales: {
            account_sid: accountSid,
            auth_token: encrypt(authToken),
            phone_number: phoneNumber || '',
            phoneNumber: phoneNumber || '',
          },
          conectado: true,
          activo: true,
        },
      });
    }

    return NextResponse.json({
      success: true,
      message: 'Twilio SMS conectado correctamente',
      integration: {
        id: integration.id,
        phoneNumber: phoneNumber,
      },
    });
  } catch (error) {
    console.error('Error connecting Twilio:', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}

/**
 * DELETE /api/integraciones/twilio
 * Desconecta Twilio SMS
 */
export async function DELETE(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: { tenant: true },
    });

    if (!user || !user.tenantId) {
      return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 });
    }

    // Desconectar
    await prisma.integration.updateMany({
      where: {
        tenantId: user.tenantId,
        tipo: 'twilio',
      },
      data: {
        conectado: false,
        credenciales: {},
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error disconnecting Twilio:', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
