import { prisma } from '@/lib/db';
import { StockService } from '@/lib/erp/stock-service';

export class LogisticsService {
  /**
   * Crea un despacho (Shipment) para un pedido
   * Valida que todos los ítems tengan stock RESERVED o READY y lotes AVAILABLE
   */
  static async createShipment(salesOrderId: string, tenantId: string, data: { carrier?: string, trackingNumber?: string }) {
    return await prisma.$transaction(async (tx) => {
      const order = await tx.salesOrder.findUnique({
        where: { id: salesOrderId, tenantId },
        include: { 
          items: { include: { catalogItem: true } },
          reservations: { include: { lot: true } }
        }
      });

      if (!order) throw new Error('Pedido no encontrado');
      if (order.status !== 'PROCESSING') throw new Error('El pedido no está en procesamiento');

      // 🛡️ VALIDACIÓN DE CALIDAD Y DISPONIBILIDAD
      for (const res of order.reservations) {
        if (res.lotId) {
          if (res.lot?.status !== 'AVAILABLE') {
             throw new Error(`El lote ${res.lot?.batchNumber} está en ${res.lot?.status}. No se puede despachar.`);
          }
        } else if (res.workOrderId) {
          // Si es MTO, debe estar terminada (status READY en el item)
          const item = order.items.find(i => i.id === res.salesOrderItemId);
          if (item?.status !== 'READY') {
            throw new Error(`El ítem ${item?.catalogItem.nombre} aún no está fabricado o aprobado.`);
          }
        }
      }

      // 1. Crear el Shipment
      const shipment = await tx.shipment.create({
        data: {
          tenantId,
          salesOrderId,
          batchNumber: `SHP-${Date.now()}`,
          carrier: data.carrier,
          trackingNumber: data.trackingNumber,
          status: 'SHIPPED',
          dispatchedAt: new Date()
        }
      });

      // 2. Consumir el stock físicamente y actualizar estados
      for (const res of order.reservations) {
        // Registrar movimiento de salida final
        await StockService.registerMovement({
          tenantId,
          warehouseId: 'MAIN_WH',
          catalogoItemId: order.items.find(i => i.id === res.salesOrderItemId)!.catalogItemId,
          lotId: res.lotId || undefined,
          quantity: -res.reservedQty,
          type: 'OUT',
          referenceId: shipment.id,
          reason: `Despacho pedido ${order.batchNumber}`
        });

        // Marcar reserva como consumida
        await tx.orderReservation.update({
          where: { id: res.id },
          data: { status: 'CONSUMED' }
        });

        // Actualizar item de pedido
        await tx.salesOrderItem.update({
          where: { id: res.salesOrderItemId },
          data: { status: 'SHIPPED' }
        });
      }

      // 3. Actualizar estado del pedido
      await tx.salesOrder.update({
        where: { id: salesOrderId },
        data: { status: 'SHIPPED' }
      });

      return shipment;
    });
  }

  /**
   * Confirma la entrega (POD) con evidencia formal
   */
  static async confirmDelivery(shipmentId: string, tenantId: string, evidence: { receiverName: string, evidenceUrl?: string, signatureHash?: string }) {
    return await prisma.$transaction(async (tx) => {
      // 1. Crear registro formal de confirmación (Audit Trail)
      const confirmation = await tx.deliveryConfirmation.create({
        data: {
          tenantId,
          shipmentId,
          confirmedBy: evidence.receiverName,
          photoEvidenceUrl: evidence.evidenceUrl,
          signatureHash: evidence.signatureHash,
          notes: 'Entrega confirmada vía sistema móvil'
        }
      });

      // 2. Actualizar el Shipment
      const shipment = await tx.shipment.update({
        where: { id: shipmentId, tenantId },
        data: {
          status: 'DELIVERED',
          deliveredAt: new Date(),
          receiverName: evidence.receiverName,
          evidenceUrl: evidence.evidenceUrl,
          receiverSignature: evidence.signatureHash
        }
      });

      // 3. Si todos los shipments del pedido están entregados, cerrar pedido y consolidar costos
      const allShipments = await tx.shipment.findMany({
        where: { salesOrderId: shipment.salesOrderId, tenantId }
      });

      const allDelivered = allShipments.every(s => s.status === 'DELIVERED');

      if (allDelivered) {
        const order = await tx.salesOrder.findUnique({
          where: { id: shipment.salesOrderId },
          include: { 
            items: { include: { catalogItem: true } },
            reservations: { include: { workOrder: true } }
          }
        });

        if (order) {
          let totalCost = 0;
          for (const item of order.items) {
            const res = order.reservations.find(r => r.salesOrderItemId === item.id);
            if (res?.workOrder) {
              // Si fue fabricado, tomamos el costo real de la OP
              totalCost += res.workOrder.quantityToMake * (item.catalogItem.precio / 2); // Simulación
            } else {
              // Si fue de stock, tomamos el costo base del catálogo
              totalCost += item.quantity * (item.catalogItem.precio * 0.6); // Simulación
            }
          }

          const realMargin = order.grandTotal - totalCost;

          await tx.salesOrder.update({
            where: { id: shipment.salesOrderId },
            data: { 
              status: 'DELIVERED',
              realCost: totalCost,
              realMargin: realMargin
            }
          });
        }
      }

      return { shipment, confirmation };
    });
  }
}
