import { prisma } from '@/lib/db';
import { StockService } from '@/lib/erp/stock-service';

export class LogisticsService {
  // ─── SHIPMENTS ────────────────────────────────────────

  /**
   * Crea un despacho (Shipment) para un pedido
   * Valida que todos los ítems tengan stock RESERVED o READY y lotes AVAILABLE
   */
  static async createShipment(salesOrderId: string, tenantId: string, data: { carrier?: string, trackingNumber?: string }) {
    return await prisma.$transaction(async (tx) => {
      const order = await tx.erp_sales_orders.findUnique({
        where: { id: salesOrderId, tenantId },
        include: { 
          erp_sales_order_items: { include: { catalogo_items: true } },
          erp_order_reservations: { include: { erp_inventory_lots: true } }
        } as any
      }) as any;

      if (!order) throw new Error('Pedido no encontrado');
      if (order.status !== 'PROCESSING') throw new Error('El pedido no está en procesamiento');

      // 🛡️ VALIDACIÓN DE CALIDAD Y DISPONIBILIDAD
      for (const res of order.erp_order_reservations) {
        if (res.lotId) {
          if (res.erp_inventory_lots?.status !== 'AVAILABLE') {
             throw new Error(`El lote ${res.erp_inventory_lots?.batchNumber} está en ${res.erp_inventory_lots?.status}. No se puede despachar.`);
          }
        } else if (res.workOrderId) {
          // Si es MTO, debe estar terminada (status READY en el item)
          const item = order.erp_sales_order_items.find((i: any) => i.id === res.salesOrderItemId);
          if (item?.status !== 'READY') {
            throw new Error(`El ítem ${item?.catalogo_items.nombre} aún no está fabricado o aprobado.`);
          }
        }
      }

      // 1. Crear el Shipment
      const shipment = await tx.erp_shipments.create({
        data: {
          tenantId,
          salesOrderId,
          batchNumber: `SHP-${Date.now()}`,
          carrier: data.carrier,
          trackingNumber: data.trackingNumber,
          status: 'SHIPPED',
          dispatchedAt: new Date()
        }
      } as any);

      // 2. Consumir el stock físicamente y actualizar estados
      for (const res of order.erp_order_reservations) {
        // Registrar movimiento de salida final
        await StockService.registerMovement({
          tenantId,
          warehouseId: 'MAIN_WH',
          catalogoItemId: order.erp_sales_order_items.find((i: any) => i.id === res.salesOrderItemId)!.catalogItemId,
          lotId: res.lotId || undefined,
          quantity: -res.reservedQty,
          type: 'OUT',
          referenceId: shipment.id,
          reason: `Despacho pedido ${order.batchNumber}`
        });

        // Marcar reserva como consumida
        await tx.erp_order_reservations.update({
          where: { id: res.id },
          data: { status: 'CONSUMED' }
        });

        // Actualizar item de pedido
        await tx.erp_sales_order_items.update({
          where: { id: res.salesOrderItemId },
          data: { status: 'SHIPPED' }
        });
      }

      // 3. Actualizar estado del pedido
      await tx.erp_sales_orders.update({
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
      const confirmation = await tx.erp_delivery_confirmations.create({
        data: {
          tenantId,
          shipmentId,
          confirmedBy: evidence.receiverName,
          photoEvidenceUrl: evidence.evidenceUrl,
          signatureHash: evidence.signatureHash,
          notes: 'Entrega confirmada vía sistema móvil'
        }
      } as any);

      // 2. Actualizar el Shipment
      const shipment = await tx.erp_shipments.update({
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
      const allShipments = await tx.erp_shipments.findMany({
        where: { salesOrderId: shipment.salesOrderId, tenantId }
      }) as any[];

      const allDelivered = allShipments.every((s: any) => s.status === 'DELIVERED');

      if (allDelivered) {
        const order = await tx.erp_sales_orders.findUnique({
          where: { id: shipment.salesOrderId },
          include: { 
            erp_sales_order_items: { include: { catalogo_items: true } },
            erp_order_reservations: { include: { erp_work_orders: true } }
          } as any
        }) as any;

        if (order) {
          let totalCost = 0;
          for (const item of order.erp_sales_order_items) {
            const res = order.erp_order_reservations.find((r: any) => r.salesOrderItemId === item.id);
            if (res?.erp_work_orders) {
              // Si fue fabricado, tomamos el costo real de la OP
              totalCost += res.erp_work_orders.quantityToMake * (item.catalogo_items.precio / 2); // Simulación
            } else {
              // Si fue de stock, tomamos el costo base del catálogo
              totalCost += item.quantity * (item.catalogo_items.precio * 0.6); // Simulación
            }
          }

          const realMargin = order.grandTotal - totalCost;

          await tx.erp_sales_orders.update({
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

  // ─── WMS ─────────────────────────────────────────────

  /**
   * Registrar recepción de mercancía en almacén
   */
  static async receiveGoods(tenantId: string, data: {
    warehouseId: string;
    purchaseOrderRef?: string;
    items: Array<{ catalogoItemId: string; quantity: number; lotNumber?: string; notes?: string }>;
  }) {
    return await prisma.$transaction(async (tx) => {
      const movements = [];
      for (const item of data.items) {
        const lotId = item.lotNumber
          ? (await (tx as any).erp_inventory_lots.create({
              data: {
                tenantId,
                catalogoItemId: item.catalogoItemId,
                batchNumber: item.lotNumber,
                status: 'AVAILABLE',
                quantity: item.quantity,
              },
            })).id
          : undefined;

        const movement = await StockService.registerMovement({
          tenantId,
          warehouseId: data.warehouseId,
          catalogoItemId: item.catalogoItemId,
          lotId,
          quantity: item.quantity,
          type: 'IN',
          reason: `Recepción mercancía${data.purchaseOrderRef ? ` - OC: ${data.purchaseOrderRef}` : ''}${item.notes ? ` - ${item.notes}` : ''}`,
        });
        movements.push(movement);
      }
      return movements;
    });
  }

  /**
   * Preparar pedido (Picking)
   */
  static async preparePicking(salesOrderId: string, tenantId: string, warehouseId: string) {
    return await prisma.$transaction(async (tx) => {
      const order = await tx.erp_sales_orders.findUnique({
        where: { id: salesOrderId, tenantId },
        include: { erp_sales_order_items: true } as any,
      }) as any;

      if (!order) throw new Error('Pedido no encontrado');

      const pickingList = [];
      for (const item of order.erp_sales_order_items as any[]) {
        const stockLevels = await (tx as any).erp_stock_levels.findMany({
          where: {
            tenantId,
            warehouseId,
            catalogoItemId: item.catalogoItemId,
            quantity: { gte: item.quantity },
          },
          include: {
            erp_inventory_lots: true,
          },
          orderBy: { lastSync: 'asc' },
        });

        if (stockLevels.length === 0) {
          throw new Error(`Stock insuficiente para ${item.catalogo_items?.nombre || item.catalogoItemId}`);
        }

        // Usar FIFO por lote
        for (const sl of stockLevels) {
          const toPick = Math.min(sl.quantity, item.quantity);
          pickingList.push({
            catalogoItemId: item.catalogoItemId,
            lotId: sl.lotId,
            warehouseId,
            quantity: toPick,
            fromLocation: sl.location || 'Sin ubicación',
          });

          await StockService.registerMovement({
            tenantId,
            warehouseId,
            catalogoItemId: item.catalogoItemId,
            lotId: sl.lotId || undefined,
            quantity: -toPick,
            type: 'OUT',
            referenceId: salesOrderId,
            reason: `Picking pedido ${order.batchNumber}`,
          });

          item.quantity -= toPick;
          if (item.quantity <= 0) break;
        }
      }

      return pickingList;
    });
  }

  /**
   * Obtener KPIs logísticos
   */
  static async getLogisticsKPIs(tenantId: string) {
    const now = new Date();
    const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [
      totalShipments,
      deliveredShipments,
      inTransit,
      monthlyShipments,
      deliveries,
      activeWarehouses,
      totalStockValue,
    ] = await Promise.all([
      (prisma as any).erp_shipments.count({ where: { tenantId } }),
      (prisma as any).erp_shipments.count({ where: { tenantId, status: 'DELIVERED' } }),
      (prisma as any).erp_shipments.count({ where: { tenantId, status: 'SHIPPED' } }),
      (prisma as any).erp_shipments.count({ where: { tenantId, createdAt: { gte: monthAgo } } }),
      (prisma as any).erp_delivery_confirmations.count({ where: { tenantId, confirmedAt: { gte: monthAgo } } }),
      prisma.warehouse.count({ where: { tenantId, active: true } }),
      (prisma as any).erp_stock_levels.aggregate({
        where: { tenantId },
        _sum: { quantity: true },
      }),
    ]);

    return {
      totalShipments,
      deliveredShipments,
      inTransit,
      monthlyShipments,
      monthlyDeliveries: deliveries,
      activeWarehouses,
      deliveryRate: totalShipments > 0 ? Math.round((deliveredShipments / totalShipments) * 100) : 0,
      totalStockUnits: totalStockValue._sum.quantity || 0,
    };
  }
}
