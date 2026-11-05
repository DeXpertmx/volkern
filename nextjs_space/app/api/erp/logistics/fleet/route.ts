import { NextRequest, NextResponse } from 'next/server';
import { withTenantAuth } from '@/lib/api-key-auth';
import { FleetService } from '@/lib/erp/fleet-service';

export const GET = withTenantAuth(async (request, auth) => {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') || undefined;
    const type = searchParams.get('type') || undefined;

    const vehicles = await FleetService.listVehicles(auth.tenant!.id, { status, type });
    return NextResponse.json({ vehicles });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}, ['erp:read']);

export const POST = withTenantAuth(async (request, auth) => {
  try {
    const body = await request.json();
    const vehicle = await FleetService.createVehicle({
      ...body,
      tenantId: auth.tenant!.id,
    });
    return NextResponse.json({ vehicle }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}, ['erp:write']);
