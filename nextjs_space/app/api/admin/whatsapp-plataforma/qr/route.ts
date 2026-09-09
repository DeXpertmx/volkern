export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/whatsapp-plataforma/qr
 * Obtiene (o refresca) el QR code de la instancia de WhatsApp de la PLATAFORMA
 * para vincular el número oficial de Volkern. Acceso solo Superadmin.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/db';
import { PLATFORM_INSTANCE_ROW_ID } from '@/lib/evolution-instances';

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
    if (row.status === 'connected') {
      return NextResponse.json({ success: true, connected: true, message: 'WhatsApp ya está conectado' });
    }

    const apiUrl = process.env.EVOLUTION_API_URL || 'https://api.dimension.expert';
    const apiKey = process.env.EVOLUTION_API_KEY || '';
    if (!apiKey) {
      return NextResponse.json({ error: 'El servicio de WhatsApp no está configurado en el servidor.' }, { status: 500 });
    }

    const response = await fetch(`${apiUrl}/instance/connect/${row.instanceName}`, {
      method: 'GET',
      headers: { apikey: apiKey },
    });

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json(
        { error: `Error al obtener QR Code (${response.status}). ${errorText.slice(0, 200)}` },
        { status: 400 },
      );
    }

    const data = await response.json();

    let qrBase64 = '';
    if (data.base64) qrBase64 = data.base64;
    else if (data.qrcode?.base64) qrBase64 = data.qrcode.base64;
    else if (data.qrcode) qrBase64 = data.qrcode;
    else if (data.code) qrBase64 = data.code;

    if (!qrBase64) {
      return NextResponse.json(
        { error: 'QR Code no disponible. La instancia puede estar ya conectada o en proceso.' },
        { status: 400 },
      );
    }

    const updated = await prisma.platformWhatsAppInstance.update({
      where: { id: PLATFORM_INSTANCE_ROW_ID },
      data: {
        qrCode: qrBase64,
        qrCodeExpiry: new Date(Date.now() + 60000),
        status: 'connecting',
      },
    });

    return NextResponse.json({
      success: true,
      connected: false,
      qrCode: { base64: qrBase64, code: data.code || data.qrcode?.code || qrBase64, pairingCode: data.pairingCode },
      instance: updated,
    });
  } catch (error) {
    console.error('Error al obtener QR Code de la plataforma:', error);
    return NextResponse.json({ error: 'Error al obtener QR Code' }, { status: 500 });
  }
}
