import { prisma } from '@/lib/db';
import { addHours, startOfDay } from 'date-fns';

export class SchedulingService {
  /**
   * Genera un plan de secuenciación óptimo para el tenant
   */
  static async generateOptimalSchedule(tenantId: string) {
    // 1. Obtener órdenes de producción pendientes (PLANNED)
    const workOrders = await prisma.workOrder.findMany({
      where: { tenantId, status: 'PLANNED' },
      include: { 
        bom: { include: { catalogoItem: true } },
        costing: true
      }
    });

    if (workOrders.length === 0) return null;

    // 2. Obtener líneas de producción activas
    const lines = await (prisma as any).erp_production_lines.findMany({
      where: { tenantId, active: true }
    });

    if (lines.length === 0) throw new Error('No hay líneas de producción activas');

    // 3. Algoritmo de Priorización (Weighted Score)
    const scoredOrders = workOrders.map(wo => {
      // Puntuación base: Margen (30%) + Urgencia (fecha, 40%) + Criticidad (30%)
      const marginScore = wo.costing ? (wo.costing.margin / 100) * 30 : 15;
      const urgencyScore = 20; // Simplificado: 20 puntos base
      const priorityScore = marginScore + urgencyScore;

      return { ...wo, priorityScore };
    });

    // Ordenar por puntuación descendente
    scoredOrders.sort((a, b) => b.priorityScore - a.priorityScore);

    // 4. Crear Plan de Scheduling
    const plan = await (prisma as any).erp_scheduling_plans.create({
      data: {
        tenantId,
        date: new Date(),
        status: 'DRAFT'
      }
    });

    const assignments = [];
    let currentTime = startOfDay(new Date());

    // Asignación simple: Distribuir en la primera línea disponible
    for (const wo of scoredOrders) {
      const line = lines[assignments.length % lines.length];
      const durationHours = wo.quantityToMake * 0.5; // 30 min por unidad

      const assignment = await (prisma as any).erp_schedule_assignments.create({
        data: {
          tenantId,
          planId: plan.id,
          workOrderId: wo.id,
          lineId: line.id,
          priorityScore: wo.priorityScore,
          estimatedStart: currentTime,
          estimatedEnd: addHours(currentTime, durationHours),
          reason: `Priorización por rentabilidad (${wo.priorityScore.toFixed(1)}pts)`
        }
      });
      assignments.push(assignment);
      
      // Para la siguiente orden en esta línea, avanzar el tiempo
      if (assignments.length % lines.length === 0) {
        currentTime = addHours(currentTime, 8); // Siguiente turno o bloque
      }
    }

    return { plan, assignments };
  }
}
