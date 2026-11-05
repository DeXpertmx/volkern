export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withTenantAuth } from '@/lib/api-key-auth';
import { getZadarmaBalance } from '@/lib/integrations/zadarma';

export const GET = withTenantAuth(async (req, auth) => {
  try {
    const tenantId = auth.tenant!.id;

    // Fetch Zadarma credentials
    const integration = await prisma.integration.findFirst({
      where: {
        tenantId,
        tipo: 'telefonia_zadarma',
      },
    });

    if (!integration || !integration.credenciales) {
      return NextResponse.json({ error: 'Zadarma integration not configured' }, { status: 404 });
    }

    const creds = integration.credenciales as any;
    if (!creds.apiKey || !creds.apiSecret) {
      return NextResponse.json({ error: 'API credentials missing' }, { status: 400 });
    }

    const balanceData = await getZadarmaBalance({
      apiKey: creds.apiKey,
      apiSecret: creds.apiSecret
    });

    return NextResponse.json(balanceData);
  } catch (error) {
    console.error('[Telephony Balance] GET Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}, ['telephony:read']);
