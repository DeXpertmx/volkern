export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/api-key-auth';
import { getFiscalConfig, CURRENCY_BY_COUNTRY, TAX_NAME_BY_COUNTRY, FISCAL_ID_LABEL_BY_COUNTRY } from '@/lib/fiscal-engine';

export async function GET(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req, ['config:read']);
    if (!auth.valid) {
      return NextResponse.json({ error: auth.error }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const leadId = searchParams.get('leadId') || undefined;
    const contactId = searchParams.get('contactId') || undefined;
    const emisorId = searchParams.get('emisorId') || undefined;
    const clientePais = searchParams.get('clientePais') || undefined;

    const config = await getFiscalConfig(auth.tenant!.id, {
      leadId, contactId, emisorId, clientePais,
    });

    return NextResponse.json(config);
  } catch (error) {
    console.error('Error al obtener configuración fiscal:', error);
    return NextResponse.json({ error: 'Error al obtener configuración fiscal' }, { status: 500 });
  }
}
