import { prisma } from '@/lib/db';
import { StockService } from '@/lib/erp/stock-service';
import { ProductionService } from '@/lib/erp/production-service';

export class OrchestrationService {
  /**
   * Procesa un ítem de pedido y decide la estrategia de cumplimiento
   */
  static async processOrderItem(itemId: string, tenantId: string) {
    return await prisma.$transaction(async (tx) => {
      const item = await (tx as any).erp_sales_order_items.findUnique({
        where: { id: itemId, tenantId },
        include: { catalogItem: true }
      });

      if (!item) throw new Error('Item de pedido no encontrado');

      // 1. Verificar si es stockable
      if (item.catalogItem.isStockable) {
        // Consultar stock disponible (excluyendo cuarentena)
        const stock = await StockService.getAvailableStock(item.catalogItemId, tenantId);

        if (stock.available >= item.quantity) {
          // ESTRATEGIA: CUMPLIMIENTO DESDE STOCK
          // Reservar lotes específicos (FIFO por simplicidad)
          const lots = await (tx as any).erp_inventory_lots.findMany({
            where: { catalogItemId: item.catalogItemId, tenantId, status: 'AVAILABLE' },
            orderBy: { createdAt: 'asc' }
          });

          let remainingToReserve = item.quantity;
          for (const lot of lots) {
            if (remainingToReserve <= 0) break;
            
            // En una implementación real, aquí cruzaríamos con StockLevel por lote
            // Por ahora simulamos reserva del lote completo o parcial
            await (tx as any).erp_order_reservations.create({
              data: {
                tenantId,
                salesOrderItemId: itemId,
                lotId: lot.id,
                reservedQty: remainingToReserve,
                status: 'ACTIVE'
              }
            });
            remainingToReserve = 0;
          }

          await (tx as any).erp_sales_order_items.update({
            where: { id: itemId },
            data: { 
              status: 'RESERVED',
              fulfillmentType: 'STOCK'
            }
          });

          return { strategy: 'STOCK', reserved: true };
        }
      }

      // 2. Si es manufacturable y no hay stock (o no es stockable)
      if (item.catalogItem.isManufactured) {
        // ESTRATEGIA: PRODUCCIÓN CONTRA PEDIDO (MTO)
        // Buscar BoM activo para el producto
        const bom = await (tx.billOfMaterials.findFirst as any)({
          where: { productId: item.catalogItemId, tenantId, active: true }
        });

        if (!bom) throw new Error(`No existe un BoM activo para el producto ${item.catalogItem.nombre}`);

        const wo = await ProductionService.createWorkOrder({
          tenantId,
          bomId: bom.id,
          quantity: item.quantity,
          batchNumber: `MTO-${item.id}` // Link al item de pedido
        });

        // Reservar desde la futura producción
        await (tx as any).erp_order_reservations.create({
          data: {
            tenantId,
            salesOrderItemId: itemId,
            workOrderId: wo.id,
            reservedQty: item.quantity,
            status: 'ACTIVE'
          }
        });

        await (tx as any).erp_sales_order_items.update({
          where: { id: itemId },
          data: { 
            status: 'PRODUCING',
            fulfillmentType: 'MAKE_TO_ORDER'
          }
        });

        return { strategy: 'PRODUCTION', workOrderId: wo.id };
      }

      throw new Error('No se pudo determinar una estrategia de cumplimiento para este ítem');
    });
  }

  /**
   * Confirma un pedido completo disparando la orquestación de todos sus ítems
   */
  static async confirmSalesOrder(orderId: string, tenantId: string) {
    const order = await (prisma as any).erp_sales_orders.findUnique({
      where: { id: orderId, tenantId },
      include: { items: true }
    });

    if (!order) throw new Error('Pedido no encontrado');

    const results = [];
    for (const item of order.items) {
      const res = await this.processOrderItem(item.id, tenantId);
      results.push({ itemId: item.id, ...res });
    }

    // Calcular promesa de entrega base (Demo: +3 días si hay producción, +1 si es stock)
    const hasProduction = results.some(r => r.strategy === 'PRODUCTION');
    const promisedDate = new Date();
    promisedDate.setDate(promisedDate.getDate() + (hasProduction ? 3 : 1));

    await prisma.$transaction([
      (prisma as any).erp_sales_orders.update({
        where: { id: orderId },
        data: { status: 'PROCESSING' }
      }),
      (prisma as any).erp_delivery_promises.create({
        data: {
          tenantId,
          salesOrderId: orderId,
          promisedDate,
          deliveryPath: hasProduction ? 'PRODUCTION' : 'STOCK',
          confidenceScore: 0.95
        }
      })
    ]);

    return results;
  }
}
