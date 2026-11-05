import { NextRequest, NextResponse } from 'next/server';
import { withTenantAuth } from '@/lib/api-key-auth';
import { LogisticsService } from '@/lib/erp/logistics-service';

export const POST = withTenantAuth(async (request, auth, { params }) => {
  try {
    const body = await request.json();
    const result = await LogisticsService.confirmDelivery(params.id, auth.tenant!.id, {
      receiverName: body.receiverName,
      evidenceUrl: body.evidenceUrl,
      signatureHash: body.signatureHash,
    });
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}, ['erp:write']);
