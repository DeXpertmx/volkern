import { prisma } from '@/lib/db';
import { ProductionService } from '@/lib/erp/production-service';
import { AutonomousMRP } from '@/lib/erp/autonomous-mrp';
import { Decimal } from 'decimal.js';

/**
 * SKILL: calculate_production_cost
 * Calcula el costo proyectado de fabricar una cantidad de producto
 */
export async function calculate_production_cost({ tenantId, bomId, quantity }: { tenantId: string, bomId: string, quantity: number }) {
  const bom = await prisma.billOfMaterials.findUnique({
    where: { id: bomId, tenantId },
    include: { catalogoItem: true }
  });

  if (!bom) throw new Error('BoM no encontrado');

  const components = bom.components as any[];
  let totalMaterialCost = new Decimal(0);

  // Consultar costos de componentes en el catálogo
  for (const comp of components) {
    const item = await prisma.catalogoItem.findUnique({
      where: { id: comp.itemId }
    });
    if (item) {
      const lineCost = new Decimal(item.precioBase).mul(comp.quantity).mul(quantity);
      totalMaterialCost = totalMaterialCost.plus(lineCost);
    }
  }

  // 🏗️ COSTO DE MANO DE OBRA (Fase 7 Placeholder)
  // Simulamos un costo fijo por hora/hombre según el módulo RRHH
  const laborCost = new Decimal(quantity).mul(15.5); // 15.5€ por unidad producida (estimado)
  const totalCost = totalMaterialCost.plus(laborCost);

  return {
    productId: bom.productId,
    productName: bom.catalogoItem.nombre,
    quantity,
    materialCost: totalMaterialCost.toNumber(),
    laborCost: laborCost.toNumber(),
    totalCost: totalCost.toNumber(),
    unitCost: totalCost.div(quantity).toNumber()
  };
}

/**
 * SKILL: verify_waste_integrity
 * Llama a la lógica de visión de Gemma para validar un reporte de merma con Vision-Lock
 */
export async function verify_waste_integrity({ tenantId, workOrderId, wasteImage }: { tenantId: string, workOrderId: string, wasteImage: string }) {
  const { VisionService } = await import('@/lib/ai/vision-service');

  const wo = await prisma.workOrder.findUnique({
    where: { id: workOrderId, tenantId },
    include: { bom: { include: { catalogoItem: true } } }
  });

  if (!wo) throw new Error('Orden no encontrada');

  // Ejecutar Análisis de Visión Forense e Industrial
  const bomItems = (wo.bom.components as any[]).map(c => c.itemId);
  const analysis = await VisionService.analyzeScrapEvidence(wasteImage, { bomItems });

  return {
    status: analysis.riskLevel === 'HIGH' ? 'REJECTED' : (analysis.riskLevel === 'MEDIUM' ? 'FLAGGED_FOR_REVIEW' : 'VERIFIED'),
    imageAnalyzed: wasteImage,
    verdict: analysis.verdict,
    rootCause: analysis.rootCause,
    correctiveAction: analysis.correctiveAction,
    riskLevel: analysis.riskLevel,
    isRecapture: analysis.isRecapture
  };
}

/**
 * SKILL: detect_bottlenecks
 * Analiza la planta en busca de retrasos críticos
 */
export async function detect_bottlenecks({ tenantId }: { tenantId: string }) {
  return await AutonomousMRP.detectBottlenecks(tenantId);
}

/**
 * SKILL: suggest_assembly_strategy
 * Obtiene recomendaciones de la IA para optimizar la línea
 */
export async function suggest_assembly_strategy({ tenantId, workOrderId }: { tenantId: string, workOrderId?: string }) {
  return await AutonomousMRP.suggestAssemblyStrategy(tenantId, workOrderId);
}
