import { prisma } from '@/lib/db';
import { StockService } from '@/lib/erp/stock-service';

export class ReadinessService {
  /**
   * Verifica la preparación de una WorkOrder analizando la cobertura de materiales
   */
  static async checkOrderReadiness(workOrderId: string, tenantId: string) {
    const workOrder = await prisma.workOrder.findUnique({
      where: { id: workOrderId },
      include: {
        bom: {
          include: {
            components: {
              include: { catalogoItem: true } as any
            }
          }
        }
      }
    });

    if (!workOrder) throw new Error('Orden de producción no encontrada');

    const requirements = [];
    let totalItems = 0;
    let itemsAvailable = 0;

    for (const component of (workOrder as any).bom.components) {
      const requiredQty = component.cantidad * workOrder.quantityToMake;
      
      // Consultar stock real filtrando por estado de calidad 'AVAILABLE'
      const stock = await StockService.getAvailableStock(component.catalogItemId, tenantId);
      
      const availableQty = Math.min(requiredQty, stock.available);
      const missingQty = Math.max(0, requiredQty - availableQty);
      
      const req = await (prisma as any).erp_material_requirements.upsert({
        where: { id: `req_${workOrderId}_${component.catalogItemId}` },
        update: {
          requiredQty,
          availableQty,
          missingQty,
          status: missingQty === 0 ? 'PENDING' : 'SHORTAGE'
        },
        create: {
          id: `req_${workOrderId}_${component.catalogItemId}`,
          tenantId,
          workOrderId,
          catalogItemId: component.catalogItemId,
          requiredQty,
          availableQty,
          missingQty,
          status: missingQty === 0 ? 'PENDING' : 'SHORTAGE'
        }
      });

      requirements.push(req);
      totalItems += requiredQty;
      itemsAvailable += availableQty;

      if (missingQty > 0) {
        await (prisma as any).erp_material_shortages.create({
          data: {
            id: `short_${Date.now()}_${component.catalogItemId}`,
            tenantId,
            catalogItemId: component.catalogItemId,
            missingQty,
            impactLevel: missingQty / requiredQty > 0.5 ? 'CRITICAL' : 'MEDIUM'
          }
        });
      }
    }

    const coveragePercent = (itemsAvailable / totalItems) * 100;
    const readyToProduce = coveragePercent >= 100;

    const readiness = await (prisma as any).erp_production_readiness.upsert({
      where: { workOrderId },
      update: {
        readyToProduce,
        coveragePercent,
        blockedReason: readyToProduce ? null : 'Falta de materiales críticos',
        checkedAt: new Date()
      },
      create: {
        id: `READ-${workOrderId}`,
        tenantId,
        workOrderId,
        readyToProduce,
        coveragePercent,
        blockedReason: readyToProduce ? null : 'Falta de materiales críticos'
      }
    });

    // Calcular cuántos lotes hay en cuarentena para estos requerimientos
    const quarantineLots = await (prisma as any).erp_inventory_lots.count({
      where: {
        catalogItemId: { in: (workOrder as any).bom.components.map((c: any) => c.catalogItemId) },
        tenantId,
        status: 'QUARANTINE'
      }
    });

    return { readiness, requirements, quarantineLots };
  }

  /**
   * Reserva materiales de forma atómica para evitar sobre-asignación (Concurrencia)
   */
  static async reserveMaterials(workOrderId: string, tenantId: string) {
    return await prisma.$transaction(async (tx: any) => {
      const requirements = await (tx as any).erp_material_requirements.findMany({
        where: { workOrderId, tenantId, status: 'PENDING' }
      });

      for (const req of requirements) {
        await (tx as any).erp_material_requirements.update({
          where: { id: req.id },
          data: { 
            reservedQty: req.requiredQty,
            status: 'RESERVED' 
          }
        });
      }

      return { success: true, count: requirements.length };
    });
  }

  /**
   * Libera una orden para producción si cumple los requisitos
   */
  static async releaseWorkOrder(workOrderId: string, tenantId: string, releasedBy: string) {
    const { readiness } = await this.checkOrderReadiness(workOrderId, tenantId);

    if (!readiness.readyToProduce && readiness.coveragePercent < 90) {
      throw new Error('No se puede liberar la orden: Cobertura de materiales insuficiente (<90%)');
    }

    // 🛡️ RESERVA ATÓMICA ANTES DE LIBERAR
    await this.reserveMaterials(workOrderId, tenantId);

    return await prisma.workOrder.update({
      where: { id: workOrderId },
      data: { 
        status: 'PLANNED',
        startDate: new Date() 
      }
    });
  }
}
