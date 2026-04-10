import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { initiateZadarmaCallback } from '@/lib/integrations/zadarma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { destination } = await req.json();
    if (!destination) {
      return NextResponse.json({ error: 'Destination number missing' }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { tenantId: true, telefono: true, metadata: true }
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // 1. Fetch Integration
    const integration = await prisma.integration.findFirst({
      where: {
        tenantId: user.tenantId!,
        tipo: 'telefonia_zadarma',
      },
    });

    if (!integration || !integration.activo) {
      return NextResponse.json({ error: 'Zadarma integration not configured or inactive' }, { status: 400 });
    }

    const creds = integration.credenciales as any;
    const { apiKey, apiSecret, fromExtension } = creds;

    if (!apiKey || !apiSecret) {
      return NextResponse.json({ error: 'Invalid Zadarma credentials' }, { status: 400 });
    }

    // Priority for Sip Extension: 
    // 1. User metadata sip_extension
    // 2. Global extension from config
    const userMetadata = (user.metadata as any) || {};
    const callerId = userMetadata.sip_extension || fromExtension;

    if (!callerId) {
      return NextResponse.json({ error: 'No SIP extension configured. Please set one in your profile or global config.' }, { status: 400 });
    }

    // 2. Call Zadarma API using the helper
    const result = await initiateZadarmaCallback(callerId, destination, { apiKey, apiSecret });

    if (result.status === 'success') {
      return NextResponse.json({ 
        success: true, 
        message: 'Llamada iniciada correctamente. Tu extensión sonará en unos segundos.' 
      });
    } else {
      console.error('[Zadarma Callback] API Error:', result);
      return NextResponse.json({ 
        success: false, 
        error: result.message || 'Error al iniciar la llamada en Zadarma' 
      }, { status: 500 });
    }

  } catch (error) {
    console.error('[Zadarma Callback] Request Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
