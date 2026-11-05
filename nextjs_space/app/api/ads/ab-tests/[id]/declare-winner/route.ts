export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { withTenantAuth } from '@/lib/api-key-auth';
import { declareWinner } from '@/lib/ads/ab-test-engine';

export const POST = withTenantAuth(async (req, auth, { params }: any) => {
  try {
    const { id } = params;
    const body = await req.json().catch(() => ({}));
    const result = await declareWinner(id, body.variantId || undefined);
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}, ['ads:write']);
