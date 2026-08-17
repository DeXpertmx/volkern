import { prisma } from '@/lib/db';
import { ReadinessService } from '@/lib/erp/readiness-service';

/**
 * SKILL: analyze_production_readiness
 * Detecta riesgos de bloqueo en órdenes de producción
 */
export async function analyze_production_readiness({ tenantId }: { tenantId: string }) {
  const readinessReports = await (prisma as any).erp_production_readiness.findMany({
    where: { tenantId, readyToProduce: false },
    include: {
      erp_work_orders: {
        include: {
          bom: { include: { catalogoItem: true } },
          erp_material_requirements: {
            where: { status: 'SHORTAGE' },
            include: { catalogo_items: true }
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
      order: r.erp_work_orders.batchNumber,
      coverage: `${r.coveragePercent.toFixed(1)}%`,
      missing: r.erp_work_orders.erp_material_requirements.map((m: any) => m.catalogo_items.nombre).join(', ')
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
  const shortages = await (prisma as any).erp_material_shortages.findMany({
    where: { tenantId },
    include: { catalogo_items: true }
  });

  if (shortages.length === 0) return { status: 'OK', message: 'No hay sugerencias de abastecimiento pendientes.' };

  const suggestions = shortages.map((s: any) => ({
    item: s.catalogo_items.nombre,
    suggestedAction: s.missingQty > 100 ? 'PURCHASE' : 'TRANSFER',
    quantity: s.missingQty,
    reason: `Faltante crítico para el cumplimiento del plan de producción semanal.`
  }));

  return {
    summary: `Se sugieren ${suggestions.length} acciones de abastecimiento para asegurar la planta.`,
    suggestions
  };
}
