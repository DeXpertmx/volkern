import { NextRequest, NextResponse } from 'next/server';
import { withTenantAuth } from '@/lib/api-key-auth';
import { LogisticsService } from '@/lib/erp/logistics-service';
import { prisma } from '@/lib/db';

export const GET = withTenantAuth(async (request, auth) => {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const limit = parseInt(searchParams.get('limit') || '20');
    const page = parseInt(searchParams.get('page') || '1');
    const skip = (page - 1) * limit;

    const where: any = { tenantId: auth.tenantId };
    if (status) where.status = status;

    const [shipments, total] = await Promise.all([
      (prisma as any).erp_shipments.findMany({
        where,
        include: {
          erp_sales_orders: {
            select: { batchNumber: true, grandTotal: true },
          },
          erp_delivery_confirmations: {
            take: 1,
            orderBy: { confirmedAt: 'desc' },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip,
      }),
      (prisma as any).erp_shipments.count({ where }),
    ]);

    return NextResponse.json({
      shipments,
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
});

export const POST = withTenantAuth(async (request, auth) => {
  try {
    const body = await request.json();
    const shipment = await LogisticsService.createShipment(body.salesOrderId, auth.tenantId, {
      carrier: body.carrier,
      trackingNumber: body.trackingNumber,
    });
    return NextResponse.json({ shipment }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
});
