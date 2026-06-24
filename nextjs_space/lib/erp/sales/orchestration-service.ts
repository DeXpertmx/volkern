import { prisma } from '@/lib/db';
import { StockService } from '@/lib/erp/stock-service';

/**
 * OrchestrationService
 * Motor de decisión operativa para decidir CÓMO y CUÁNDO cumplir cada pedido.
 */
export class OrchestrationService {
  /**
   * Analiza un pedido y decide la estrategia de cumplimiento (STOCK vs PRODUCTION).
   */
  static async analyzeFulfillment(orderId: string, tenantId: string) {
    const order = await (prisma as any).salesOrder.findUnique({
      where: { id: orderId, tenantId },
      include: {
        items: {
          include: {
            catalogItem: {
              include: {
                billOfMaterials: true
              }
            }
          }
        }
      }
    });

    if (!order) throw new Error('Pedido no encontrado');

    const orchestrationLog: any[] = [];
    let overallConfidence = 1.0;
    let maxLeadTimeDays = 0;

    for (const item of order.items) {
      // 1. Calcular stock disponible real (ATP)
      const { available: availableStock } = await StockService.getAvailableStock(item.catalogItemId, tenantId);
      
      let strategy: 'STOCK' | 'PRODUCTION' = 'STOCK';
      let estDays = 2; // Default 2 días para despacho desde stock

      if (availableStock < item.quantity) {
        // No hay stock suficiente -> CTP (Production)
        strategy = 'PRODUCTION';
        
        // Estimar lead time desde la BoM o fallback
        const bom = item.catalogItem.billOfMaterials;
        const productionLeadTime = (bom?.metadata as any)?.leadTimeDays || 7;
        estDays = productionLeadTime;
        
        if (estDays > maxLeadTimeDays) maxLeadTimeDays = estDays;
        overallConfidence *= 0.85; // Menor confianza al depender de producción
      }

      const fulfillmentDate = new Date();
      fulfillmentDate.setDate(fulfillmentDate.getDate() + estDays);

      // Actualizar ítem con la estrategia decidida
      await (prisma as any).salesOrderItem.update({
        where: { id: item.id },
        data: {
          orchestrationStrategy: strategy,
          fulfillmentDate
        }
      });

      orchestrationLog.push({
        itemId: item.id,
        sku: item.catalogItem.sku,
        strategy,
        availableStock,
        required: item.quantity,
        estDays
      });
    }

    // Calcular fecha de entrega final del pedido (basada en el ítem más lento)
    const finalDeliveryPromise = new Date();
    finalDeliveryPromise.setDate(finalDeliveryPromise.getDate() + maxLeadTimeDays + 1);

    // Actualizar el pedido
    return await (prisma as any).salesOrder.update({
      where: { id: orderId },
      data: {
        deliveryPromise: finalDeliveryPromise,
        confidenceScore: overallConfidence,
        orchestrationLog
      }
    });
  }

  /**
   * Ejecuta las acciones operativas derivadas de la orquestación (ej. crear WorkOrders).
   */
  static async executeOrchestration(orderId: string, tenantId: string) {
    const order = await (prisma as any).salesOrder.findUnique({
      where: { id: orderId, tenantId },
      include: {
        items: {
          include: {
            catalogItem: {
              include: { billOfMaterials: true }
            }
          }
        }
      }
    });

    if (!order) throw new Error('Pedido no encontrado');

    const createdWorkOrders = [];

    for (const item of order.items) {
      if (item.orchestrationStrategy === 'PRODUCTION') {
        const bom = item.catalogItem.billOfMaterials;
        if (!bom) continue;

        // Crear WorkOrder en estado PLANNED
        const wo = await prisma.workOrder.create({
          data: {
            tenantId,
            bomId: bom.id,
            quantityToMake: item.quantity,
            status: 'PLANNED',
            endDate: item.fulfillmentDate || new Date()
          }
        });
        createdWorkOrders.push(wo.id);
      }
    }

    return createdWorkOrders;
  }
}
