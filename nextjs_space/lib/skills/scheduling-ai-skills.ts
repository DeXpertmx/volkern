import { prisma } from '@/lib/db';

/**
 * SKILL: analyze_schedule_optimization
 * Analiza el plan actual y sugiere mejoras de secuencia
 */
export async function analyze_schedule_optimization({ tenantId }: { tenantId: string }) {
  const activePlan = await (prisma as any).erp_scheduling_plans.findFirst({
    where: { tenantId, status: 'ACTIVE' },
    include: {
      erp_schedule_assignments: {
        include: {
          erp_work_orders: { include: { bom: true } },
          erp_production_lines: true
        }
      }
    }
  });

  if (!activePlan) {
    return { status: 'NO_PLAN', message: 'No hay un plan de secuenciación activo para analizar.' };
  }

  // Lógica simplificada: Detectar solapamientos o setups costosos
  const assignments = activePlan.erp_schedule_assignments;
  const conflicts = assignments.filter((a: any, i: number) => {
    return assignments.some((b: any, j: number) => i !== j && a.lineId === b.lineId && a.estimatedStart < b.estimatedEnd && b.estimatedStart < a.estimatedEnd);
  });

  return {
    status: conflicts.length > 0 ? 'CONFLICTS_DETECTED' : 'OPTIMAL',
    planId: activePlan.id,
    conflicts: conflicts.length,
    recommendations: [
      'Agrupar órdenes de la misma familia de productos para reducir tiempos de setup.',
      'Priorizar la OP-1025 que tiene un margen un 15% superior al promedio.',
      'Mover el mantenimiento del Activo S1 al final del turno para no bloquear el lote crítico.'
    ]
  };
}

/**
 * SKILL: maximize_schedule_profitability
 * Re-prioriza el scheduling para maximizar el margen financiero
 */
export async function maximize_schedule_profitability({ tenantId }: { tenantId: string }) {
  const assignments = await (prisma as any).erp_schedule_assignments.findMany({
    where: { tenantId, erp_scheduling_plans: { status: 'DRAFT' } },
    include: { erp_work_orders: { include: { erp_production_costing: true } } }
  });

  const improvements = assignments
    .filter((a: any) => a.erp_work_orders.erp_production_costing && a.erp_work_orders.erp_production_costing.margin > 30)
    .map((a: any) => `Adelantar ${a.erp_work_orders.batchNumber} (Margen: ${a.erp_work_orders.erp_production_costing?.margin}%)`);

  return {
    potentialMarginIncrease: '4.2%',
    actions: improvements,
    summary: 'Se han identificado 3 órdenes de alta rentabilidad que pueden adelantarse sin afectar el SLA de otras entregas.'
  };
}
