import { NextResponse } from 'next/server';
import { withTenantAuth } from '@/lib/api-key-auth';
import { LogisticsService } from '@/lib/erp/logistics-service';

export const GET = withTenantAuth(async (request, auth) => {
  try {
    const kpis = await LogisticsService.getLogisticsKPIs(auth.tenant!.id);
    return NextResponse.json({ kpis });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}, ['erp:read']);
