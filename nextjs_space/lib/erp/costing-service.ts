import { prisma } from '@/lib/db';
import { Decimal } from 'decimal.js';

export class CostingService {
  /**
   * Calcula el costo real de una orden de producción al finalizar
   */
  static async calculateRealCost(workOrderId: string, tenantId: string) {
    const wo = await prisma.workOrder.findUnique({
      where: { id: workOrderId, tenantId },
      include: { 
        bom: { include: { components: true } },
        productionLogs: true,
        erp_industrial_assets: true
      }
    });

    if (!wo) throw new Error('Orden de producción no encontrada');

    // 1. COSTO DE MATERIALES (Basado en consumo real en logs)
    const consumptionLogs = wo.productionLogs.filter(log => log.action === 'CONSUMPTION');
    let materialCost = 0;
    
    for (const log of consumptionLogs) {
      // En un sistema real, buscaríamos el PMP (Precio Medio Ponderado) del item
      // Aquí simulamos un costo base de 10 por unidad si no hay datos
      const unitCost = 10; 
      materialCost += log.quantity * unitCost;
    }

    // 2. COSTO DE MANO DE OBRA (Basado en tiempo real)
    let laborCost = 0;
    if (wo.startDate && wo.endDate) {
      const hours = (wo.endDate.getTime() - wo.startDate.getTime()) / (1000 * 60 * 60);
      const hourlyRate = 25; // Tarifa estándar por hora
      laborCost = hours * hourlyRate;
    }

    // 3. COSTO DE MERMA (Impacto directo de VISION-LOCK)
    const scrapLogs = wo.productionLogs.filter(log => log.action === 'SCRAP');
    let scrapCost = 0;
    for (const log of scrapLogs) {
      const unitCost = 10; // El mismo costo de material perdido
      scrapCost += log.quantity * unitCost;
    }

    // 4. OVERHEAD DE MANTENIMIENTO Y FIJOS
    let maintenanceCost = 0;
    if (wo.assetId && wo.startDate && wo.endDate) {
      const hours = (wo.endDate.getTime() - wo.startDate.getTime()) / (1000 * 60 * 60);
      maintenanceCost = hours * 5; // Tarifa de desgaste de máquina
    }

    const totalCost = materialCost + laborCost + scrapCost + maintenanceCost;
    
    // 5. COSTO ESTIMADO (Basado en BoM teórico)
    const estimatedMaterialCost = wo.bom.components.reduce((acc: number, comp: any) => {
      return acc + (comp.quantity * wo.quantityToMake * 10);
    }, 0);
    const estimatedLaborCost = wo.quantityToMake * 0.5 * 25; // 30 min por unidad
    const estimatedCost = estimatedMaterialCost + estimatedLaborCost;

    const variance = totalCost - estimatedCost;
    
    // 6. MARGEN (Simulando precio de venta de BoM + 40%)
    const revenue = estimatedCost * 1.4;
    const margin = ((revenue - totalCost) / revenue) * 100;

    return await (prisma as any).erp_production_costing.upsert({
      where: { workOrderId },
      create: {
        id: `COST-${workOrderId}`,
        tenantId,
        workOrderId,
        materialCost,
        laborCost,
        scrapCost,
        maintenanceCost,
        totalCost,
        estimatedCost,
        variance,
        margin,
        updatedAt: new Date()
      },
      update: {
        materialCost,
        laborCost,
        scrapCost,
        maintenanceCost,
        totalCost,
        estimatedCost,
        variance,
        margin,
        updatedAt: new Date()
      }
    });
  }
}
