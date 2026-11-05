import { NextRequest, NextResponse } from 'next/server';
import { withTenantAuth } from '@/lib/api-key-auth';
import { LogisticsService } from '@/lib/erp/logistics-service';
import { prisma } from '@/lib/db';

export const GET = withTenantAuth(async (request, auth) => {
  try {
    const warehouses = await prisma.warehouse.findMany({
      where: { tenantId: auth.tenant!.id, active: true },
      include: {
        _count: { select: { stockLevels: true } },
      },
    });
    return NextResponse.json({ warehouses });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}, ['erp:read']);

export const POST = withTenantAuth(async (request, auth) => {
  try {
    const body = await request.json();
    const movements = await LogisticsService.receiveGoods(auth.tenant!.id, body);
    return NextResponse.json({ movements }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}, ['erp:write']);
