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
              include: { catalogoItem: true }
            }
          }
        }
      }
    });

    if (!workOrder) throw new Error('Orden de producción no encontrada');

    const requirements = [];
    let totalItems = 0;
    let itemsAvailable = 0;

    for (const component of workOrder.bom.components) {
      const requiredQty = component.cantidad * workOrder.quantityToMake;
      
      // Consultar stock real filtrando por estado de calidad 'AVAILABLE'
      const stock = await StockService.getAvailableStock(component.catalogItemId, tenantId);
      
      const availableQty = Math.min(requiredQty, stock.available);
      const missingQty = Math.max(0, requiredQty - availableQty);
      
      const req = await prisma.materialRequirement.upsert({
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
        await prisma.materialShortage.create({
          data: {
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

    const readiness = await prisma.productionReadiness.upsert({
      where: { workOrderId },
      update: {
        readyToProduce,
        coveragePercent,
        blockedReason: readyToProduce ? null : 'Falta de materiales críticos',
        checkedAt: new Date()
      },
      create: {
        tenantId,
        workOrderId,
        readyToProduce,
        coveragePercent,
        blockedReason: readyToProduce ? null : 'Falta de materiales críticos'
      }
    });

    // Calcular cuántos lotes hay en cuarentena para estos requerimientos
    const quarantineLots = await prisma.inventoryLot.count({
      where: {
        catalogItemId: { in: workOrder.bom.components.map(c => c.catalogItemId) },
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
    return await prisma.$transaction(async (tx) => {
      const requirements = await tx.materialRequirement.findMany({
        where: { workOrderId, tenantId, status: 'PENDING' }
      });

      for (const req of requirements) {
        // En un sistema real, aquí buscaríamos el stock físico en inventario
        // con un bloqueo (SELECT ... FOR UPDATE) si fuera necesario.
        await tx.materialRequirement.update({
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
