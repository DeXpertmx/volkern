import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withTenantAuth } from '@/lib/api-key-auth';
import { OrchestrationService } from '@/lib/erp/orchestration-service';

/**
 * GET /api/erp/sales/orders - Listar pedidos de venta
 */
export const GET = withTenantAuth(async (request, auth) => {
  try {
    const tenantId = auth.tenant!.id;
    const orders = await prisma.salesOrder.findMany({
      where: { tenantId },
      include: {
        contact: true,
        items: { include: { catalogItem: true } },
        shipments: true
      },
      orderBy: { createdAt: 'desc' }
    });

    return NextResponse.json(orders);
  } catch (error) {
    return NextResponse.json({ error: 'Error al cargar pedidos' }, { status: 500 });
  }
}, ['erp:read']);

/**
 * POST /api/erp/sales/orders - Crear nuevo pedido y disparar orquestación
 */
export const POST = withTenantAuth(async (request, auth) => {
  try {
    const tenantId = auth.tenant!.id;
    const body = await request.json();
    
    const { contactId, items, priority, deliveryPromise, shippingAddress } = body;

    const order = await prisma.$transaction(async (tx) => {
      // 1. Crear el pedido
      const newOrder = await tx.salesOrder.create({
        data: {
          tenantId,
          contactId,
          batchNumber: `SO-${Date.now()}`,
          priority: priority || 'NORMAL',
          deliveryPromise: deliveryPromise ? new Date(deliveryPromise) : null,
          shippingAddress,
          status: 'DRAFT',
          totalPrice: items.reduce((acc: number, item: any) => acc + (item.quantity * item.unitPrice), 0)
        }
      });

      // 2. Crear las líneas
      for (const item of items) {
        await tx.salesOrderItem.create({
          data: {
            tenantId,
            salesOrderId: newOrder.id,
            catalogItemId: item.catalogItemId,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            totalPrice: item.quantity * item.unitPrice,
            status: 'PENDING'
          }
        });
      }

      return newOrder;
    });

    // 3. Disparar Orquestación (Síncrona para la demo, asíncrona en real)
    const orchestration = await OrchestrationService.confirmSalesOrder(order.id, tenantId);

    return NextResponse.json({ order, orchestration });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}, ['erp:write']);
