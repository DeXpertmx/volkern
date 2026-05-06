export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { tenantId: true }
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const integration = await prisma.integration.findFirst({
      where: {
        tenantId: user.tenantId,
        tipo: 'telefonia_zadarma',
      },
    });

    return NextResponse.json(integration || { activo: false, credenciales: {} });
  } catch (error) {
    console.error('[Telephony Config] GET Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { tenantId: true }
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const { apiKey, apiSecret, fromExtension, recordingEnabled, activo } = body;

    const integration = await prisma.integration.upsert({
      where: {
        // Since there's no unique constraint on (tenantId, tipo), we find it first
        id: (await prisma.integration.findFirst({
          where: { tenantId: user.tenantId, tipo: 'telefonia_zadarma' }
        }))?.id || 'new-id'
      },
      create: {
        tenantId: user.tenantId,
        tipo: 'telefonia_zadarma',
        activo: activo ?? true,
        credenciales: {
          apiKey,
          apiSecret,
          fromExtension,
          recordingEnabled: recordingEnabled ?? true,
        }
      },
      update: {
        activo: activo ?? true,
        credenciales: {
          apiKey,
          apiSecret,
          fromExtension,
          recordingEnabled: recordingEnabled ?? true,
        }
      }
    });

    return NextResponse.json(integration);
  } catch (error) {
    console.error('[Telephony Config] POST Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
