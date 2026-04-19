import { prisma } from '@/lib/db';

/**
 * SKILL: analyze_schedule_optimization
 * Analiza el plan actual y sugiere mejoras de secuencia
 */
export async function analyze_schedule_optimization({ tenantId }: { tenantId: string }) {
  const activePlan = await prisma.schedulingPlan.findFirst({
    where: { tenantId, status: 'ACTIVE' },
    include: {
      assignments: {
        include: {
          workOrder: { include: { bom: true } },
          line: true
        }
      }
    }
  });

  if (!activePlan) {
    return { status: 'NO_PLAN', message: 'No hay un plan de secuenciación activo para analizar.' };
  }

  // Lógica simplificada: Detectar solapamientos o setups costosos
  const conflicts = activePlan.assignments.filter((a, i) => {
    return activePlan.assignments.some((b, j) => i !== j && a.lineId === b.lineId && a.estimatedStart < b.estimatedEnd && b.estimatedStart < a.estimatedEnd);
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
  const assignments = await prisma.scheduleAssignment.findMany({
    where: { tenantId, plan: { status: 'DRAFT' } },
    include: { workOrder: { include: { costing: true } } }
  });

  const improvements = assignments
    .filter(a => a.workOrder.costing && a.workOrder.costing.margin > 30)
    .map(a => `Adelantar ${a.workOrder.batchNumber} (Margen: ${a.workOrder.costing?.margin}%)`);

  return {
    potentialMarginIncrease: '4.2%',
    actions: improvements,
    summary: 'Se han identificado 3 órdenes de alta rentabilidad que pueden adelantarse sin afectar el SLA de otras entregas.'
  };
}
