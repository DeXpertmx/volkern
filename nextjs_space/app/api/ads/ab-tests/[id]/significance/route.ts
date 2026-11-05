export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { withTenantAuth } from '@/lib/api-key-auth';
import { calculateSignificance } from '@/lib/ads/ab-test-engine';

export const GET = withTenantAuth(async (req, auth, { params }: any) => {
  try {
    const { id } = params;
    const result = await calculateSignificance(id);
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}, ['ads:read']);
