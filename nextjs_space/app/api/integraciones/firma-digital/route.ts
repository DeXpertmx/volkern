export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { encrypt } from '@/lib/core/crypto';
import crypto from 'crypto';

// Marca usada para ocultar secretos en la respuesta (igual que messaging-hub)
const MASK = '••••••••••••••••';

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { tenantId: true }
    });

    if (!user?.tenantId) {
      return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 });
    }

    const settings = await prisma.clientSignatureSettings.findUnique({
      where: { tenantId: user.tenantId }
    });

    if (!settings) {
      return NextResponse.json({ configured: false, tenantId: user.tenantId });
    }

    return NextResponse.json({
      configured: true,
      tenantId: user.tenantId,
      id: settings.id,
      provider: settings.provider,
      url: settings.url,
      apiToken: settings.apiTokenEncrypted ? MASK : '',
      webhookSecret: settings.webhookSecretEncrypted ? MASK : '',
      isActive: settings.isActive,
      settings: settings.settings,
      // URL que debe registrarse como callback en la instancia LibreSign
      webhookUrl: `${process.env.NEXT_PUBLIC_APP_URL || ''}/api/webhooks/signatures?tenantId=${user.tenantId}`
    });
  } catch (error: any) {
    console.error('Error fetching firma digital settings:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { tenantId: true }
    });

    if (!user?.tenantId) {
      return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 });
    }

    const body = await req.json();
    const { url, apiToken, webhookSecret, isActive, provider } = body;

    if (!url) {
      return NextResponse.json({ error: 'La URL de la instancia LibreSign es obligatoria' }, { status: 400 });
    }

    const existing = await prisma.clientSignatureSettings.findUnique({
      where: { tenantId: user.tenantId }
    });

    // Si el usuario deja el campo enmascarado, se conserva el secreto cifrado actual
    const tokenToStore = apiToken && !apiToken.includes('•')
      ? encrypt(apiToken)
      : existing?.apiTokenEncrypted || '';

    const webhookSecretToStore = webhookSecret && !webhookSecret.includes('•')
      ? encrypt(webhookSecret)
      : existing?.webhookSecretEncrypted || encrypt(crypto.randomBytes(32).toString('hex'));

    const data = {
      provider: provider || 'libresign',
      url,
      apiTokenEncrypted: tokenToStore,
      webhookSecretEncrypted: webhookSecretToStore,
      isActive: isActive ?? true
    };

    let settings;
    if (existing) {
      settings = await prisma.clientSignatureSettings.update({
        where: { tenantId: user.tenantId },
        data
      });
    } else {
      settings = await prisma.clientSignatureSettings.create({
        data: {
          tenantId: user.tenantId,
          ...data
        }
      });
    }

    return NextResponse.json({
      success: true,
      configured: true,
      id: settings.id,
      webhookUrl: `${process.env.NEXT_PUBLIC_APP_URL || ''}/api/webhooks/signatures?tenantId=${user.tenantId}`
    });
  } catch (error: any) {
    console.error('Error saving firma digital settings:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
