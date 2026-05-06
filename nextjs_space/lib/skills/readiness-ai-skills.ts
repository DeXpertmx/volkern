import { prisma } from '@/lib/db';
import { ReadinessService } from '@/lib/erp/readiness-service';

/**
 * SKILL: analyze_production_readiness
 * Detecta riesgos de bloqueo en órdenes de producción
 */
export async function analyze_production_readiness({ tenantId }: { tenantId: string }) {
  const readinessReports = await prisma.productionReadiness.findMany({
    where: { tenantId, readyToProduce: false },
    include: {
      workOrder: {
        include: {
          bom: { include: { catalogoItem: true } },
          materialRequirements: {
            where: { status: 'SHORTAGE' },
            include: { catalogItem: true }
          }
        }
      }
    }
  });

  if (readinessReports.length === 0) {
    return { status: 'OPTIMAL', message: 'Todas las órdenes planificadas tienen cobertura material completa.' };
  }

  const criticalIssues = readinessReports.filter((r: any) => r.coveragePercent < 70);

  return {
    status: criticalIssues.length > 0 ? 'CRITICAL' : 'WARNING',
    message: `Se han detectado ${readinessReports.length} órdenes con faltantes de material.`,
    details: readinessReports.map((r: any) => ({
      order: r.workOrder.batchNumber,
      coverage: `${r.coveragePercent.toFixed(1)}%`,
      missing: r.workOrder.materialRequirements.map((m: any) => m.catalogItem.nombre).join(', ')
    })),
    recommendations: [
      'Priorizar la compra de los insumos marcados en rojo.',
      'Evaluar el retraso de la OP-1028 hasta recibir el stock de seguridad.',
      'Considerar la sustitución aprobada del componente X por el Y.'
    ]
  };
}

/**
 * SKILL: suggest_procurement_plan
 * Genera sugerencias de compra o transferencia basadas en el plan de producción
 */
export async function suggest_procurement_plan({ tenantId }: { tenantId: string }) {
  const shortages = await prisma.materialShortage.findMany({
    where: { tenantId },
    include: { catalogItem: true }
  });

  if (shortages.length === 0) return { status: 'OK', message: 'No hay sugerencias de abastecimiento pendientes.' };

  const suggestions = shortages.map((s: any) => ({
    item: s.catalogItem.nombre,
    suggestedAction: s.missingQty > 100 ? 'PURCHASE' : 'TRANSFER',
    quantity: s.missingQty,
    reason: `Faltante crítico para el cumplimiento del plan de producción semanal.`
  }));

  return {
    summary: `Se sugieren ${suggestions.length} acciones de abastecimiento para asegurar la planta.`,
    suggestions
  };
}
