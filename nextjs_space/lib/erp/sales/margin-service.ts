import { prisma } from '@/lib/db';

/**
 * MarginService
 * Protege la rentabilidad del Hub de Ventas analizando costos operativos vs precios de venta.
 */
export class MarginService {
  /**
   * Calcula el margen operativo de un pedido basándose en la BoM actual de sus productos.
   */
  static async calculateOrderMargin(orderId: string, tenantId: string) {
    const order = await prisma.salesOrder.findUnique({
      where: { id: orderId, tenantId },
      include: { 
        items: {
          include: {
            catalogItem: {
              include: {
                billOfMaterials: {
                  include: {
                    components: {
                      include: {
                        component: true
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    });

    if (!order) throw new Error('Pedido no encontrado');

    let totalOperationalCost = 0;
    let totalRevenue = order.totalPrice;

    for (const item of order.items) {
      // Intentar obtener el costo desde la BoM
      const bom = item.catalogItem.billOfMaterials;
      let itemCost = 0;

      if (bom) {
        // Sumar costos de materiales
        for (const boMComp of bom.components) {
          const materialPrice = boMComp.component.precioBase || 0;
          itemCost += materialPrice * boMComp.quantityRequired;
        }
        
        // Sumar costos directos e indirectos
        itemCost += bom.laborCost || 0;
        itemCost += bom.overheadCost || 0;
      } else {
        // Fallback al costo base del item si no hay BoM
        itemCost = (item.catalogItem as any).costOfAcquisition || ((item.catalogItem as any).precioBase * 0.6) || 0;
      }

      totalOperationalCost += itemCost * item.quantity;
    }

    const realMargin = totalRevenue - totalOperationalCost;
    const grossMargin = totalRevenue > 0 ? (realMargin / totalRevenue) * 100 : 0;
    const marginAlert = grossMargin < 15; // Alerta si es inferior al 15%

    // Actualizar el pedido con las métricas
    return await prisma.salesOrder.update({
      where: { id: orderId },
      data: {
        realMargin,
        grossMargin,
        operationalCost: totalOperationalCost,
        marginAlert,
        realCost: totalOperationalCost
      }
    });
  }

  /**
   * Valida si un pedido puede ser confirmado basándose en políticas de margen.
   */
  static async validateMarginPolicy(orderId: string, tenantId: string) {
    const order = await this.calculateOrderMargin(orderId, tenantId);
    
    if (order.grossMargin! < 5) {
      throw new Error(`POLÍTICA DE MARGEN: El margen del ${order.grossMargin?.toFixed(2)}% es inaceptable (Mínimo 5%).`);
    }

    return order;
  }
}
