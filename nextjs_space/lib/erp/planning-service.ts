import { prisma } from '@/lib/db';
import { startOfDay, endOfDay, addDays, format } from 'date-fns';

export class PlanningService {
  /**
   * Calcula la capacidad disponible para una línea en un periodo
   */
  static async calculateLineCapacity(lineId: string, tenantId: string, date: Date = new Date()) {
    const start = startOfDay(date);
    const end = endOfDay(date);

    // 1. Obtener turnos activos para el día de la semana
    const dayOfWeek = date.getDay();
    const shifts = await (prisma as any).erp_shift_plans.findMany({
      where: { tenantId, dayOfWeek, active: true }
    });

    let theoreticalHours = 0;
    for (const shift of shifts) {
      const [startH, startM] = shift.startTime.split(':').map(Number);
      const [endH, endM] = shift.endTime.split(':').map(Number);
      const hours = (endH + endM / 60) - (startH + startM / 60);
      theoreticalHours += hours * shift.capacityFactor;
    }

    // 2. Obtener mantenimiento programado (bloqueos)
    const maintenanceOrders = await (prisma as any).erp_maintenance_orders.findMany({
      where: {
        tenantId,
        erp_industrial_assets: { lineId },
        status: 'PLANNED',
        plannedDate: { gte: start, lte: end }
      }
    });

    // Simulamos que cada orden de mantenimiento bloquea 4 horas
    const blockedHours = maintenanceOrders.length * 4;

    // 3. Obtener carga de órdenes de producción ya planificadas
    const workOrders = await prisma.workOrder.findMany({
      where: {
        tenantId,
        lineId,
        status: { in: ['PLANNED', 'IN_PROGRESS'] },
        startDate: { lte: end },
        endDate: { gte: start }
      }
    });

    // Simulamos carga basada en cantidad restante (0.5h por unidad)
    let plannedLoad = workOrders.reduce((acc, wo) => acc + (wo.quantityToMake - wo.quantityProduced) * 0.5, 0);

    const availableHours = Math.max(0, theoreticalHours - blockedHours);
    const effectiveHours = Math.max(0, availableHours - plannedLoad);
    const utilizationRate = theoreticalHours > 0 ? ((theoreticalHours - effectiveHours) / theoreticalHours) * 100 : 0;

    return await (prisma as any).erp_production_capacity.create({
      data: {
        id: `CAP-${lineId}-${date.getTime()}`,
        tenantId,
        lineId,
        periodStart: start,
        periodEnd: end,
        theoreticalHours,
        availableHours,
        blockedHours,
        effectiveHours,
        utilizationRate
      }
    });
  }

  /**
   * Genera un forecast a 7 días
   */
  static async generate7DayForecast(tenantId: string) {
    const lines = await (prisma as any).erp_production_lines.findMany({ where: { tenantId, active: true } });
    const forecast = [];

    for (let i = 0; i < 7; i++) {
      const date = addDays(new Date(), i);
      for (const line of lines) {
        const capacity = await this.calculateLineCapacity(line.id, tenantId, date);
        
        forecast.push({
          date: format(date, 'yyyy-MM-dd'),
          line: line.name,
          utilization: capacity.utilizationRate,
          risk: capacity.utilizationRate > 90 ? 'CRITICAL' : capacity.utilizationRate > 75 ? 'HIGH' : 'LOW'
        });
      }
    }

    return forecast;
  }
}
