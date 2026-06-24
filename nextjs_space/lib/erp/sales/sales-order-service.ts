import { prisma } from '@/lib/db';
import { MarginService } from './margin-service';
import { OrchestrationService } from './orchestration-service';

/**
 * SalesOrderService
 * Gestiona el ciclo de vida de los pedidos y la orquestación comercial.
 */
export class SalesOrderService {
  /**
   * Transiciona un pedido a un nuevo estado con auditoría obligatoria.
   */
  static async transitionStatus(data: {
    orderId: string;
    tenantId: string;
    newStatus: string;
    userId?: string;
    reason?: string;
  }) {
    const order = await (prisma as any).salesOrder.findUnique({
      where: { id: data.orderId, tenantId: data.tenantId }
    });

    if (!order) throw new Error('Pedido no encontrado');
    const previousStatus = order.status;

    // Lógica específica por transición
    if (data.newStatus === 'CONFIRMED') {
      // 1. Validar políticas de margen
      await MarginService.validateMarginPolicy(data.orderId, data.tenantId);
      
      // 2. Ejecutar Orquestación Inteligente (ATP/CTP)
      await OrchestrationService.analyzeFulfillment(data.orderId, data.tenantId);
      
      // 3. Disparar acciones operativas (WorkOrders, etc)
      await OrchestrationService.executeOrchestration(data.orderId, data.tenantId);
    }

    // Actualizar pedido
    const updatedOrder = await (prisma as any).salesOrder.update({
      where: { id: data.orderId },
      data: { status: data.newStatus },
      include: { items: true }
    });

    // Crear log de auditoría
    await (prisma as any).salesOrderAudit.create({
      data: {
        tenantId: data.tenantId,
        salesOrderId: data.orderId,
        userId: data.userId,
        previousStatus,
        newStatus: data.newStatus,
        reason: data.reason,
        metadata: {
          grossMargin: updatedOrder.grossMargin,
          totalPrice: updatedOrder.totalPrice
        }
      }
    });

    return updatedOrder;
  }

  /**
   * Obtiene el resumen operativo de ventas para el Hub.
   */
  static async getSalesSummary(tenantId: string) {
    const orders = await (prisma as any).salesOrder.findMany({
      where: { tenantId },
      include: { contact: true, items: true }
    });

    const totalRevenue = orders.reduce((sum: number, o: any) => sum + o.totalPrice, 0);
    const avgMargin = orders.reduce((sum: number, o: any) => sum + (o.grossMargin || 0), 0) / (orders.length || 1);
    const alerts = orders.filter((o: any) => o.marginAlert).length;

    return {
      orders,
      stats: {
        totalRevenue,
        avgMargin,
        alerts
      }
    };
  }
}
