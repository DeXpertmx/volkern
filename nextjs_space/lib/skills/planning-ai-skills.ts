import { prisma } from '@/lib/db';
import { PlanningService } from '@/lib/erp/planning-service';

/**
 * SKILL: analyze_capacity_forecast
 * Detecta cuellos de botella y riesgos de saturación
 */
export async function analyze_capacity_forecast({ tenantId }: { tenantId: string }) {
  const forecast = await PlanningService.generate7DayForecast(tenantId);
  
  const highRiskDays = forecast.filter(f => f.risk === 'CRITICAL' || f.risk === 'HIGH');

  if (highRiskDays.length === 0) {
    return { 
      status: 'OPTIMAL', 
      message: 'La planta tiene capacidad suficiente para los próximos 7 días. Todas las líneas operan por debajo del 75% de utilización.' 
    };
  }

  const summary = highRiskDays.map(d => `${d.line} el día ${d.date} (${d.utilization.toFixed(1)}%)`).join(', ');

  return {
    status: 'WARNING',
    message: `Se han detectado riesgos de saturación en: ${summary}.`,
    recommendations: [
      'Considerar la apertura de un turno extra para las líneas críticas.',
      'Evaluar la reprogramación de órdenes no urgentes a días con menor carga.',
      'Verificar si hay mantenimientos que puedan posponerse sin riesgo.'
    ],
    details: highRiskDays
  };
}

/**
 * SKILL: simulate_production_scenario
 * Simula el impacto de una nueva orden grande en el forecast
 */
export async function simulate_production_scenario({ 
  tenantId, 
  lineId, 
  addedUnits 
}: { 
  tenantId: string, 
  lineId: string, 
  addedUnits: number 
}) {
  const line = await (prisma as any).productionLine.findUnique({ where: { id: lineId } });
  if (!line) return { error: 'Línea no encontrada' };

  // Simulamos carga: 0.5h por unidad
  const addedHours = addedUnits * 0.5;
  const currentCapacity = await PlanningService.calculateLineCapacity(lineId, tenantId);
  
  const newUtilization = ((currentCapacity.theoreticalHours - (currentCapacity.effectiveHours - addedHours)) / currentCapacity.theoreticalHours) * 100;

  return {
    line: line.name,
    addedUnits,
    impact: {
      currentUtilization: `${currentCapacity.utilizationRate.toFixed(1)}%`,
      simulatedUtilization: `${newUtilization.toFixed(1)}%`,
      status: newUtilization > 100 ? 'OVERLOAD' : newUtilization > 85 ? 'RISK' : 'SAFE'
    },
    recommendation: newUtilization > 100 
      ? 'La línea se saturará completamente. Es imperativo redistribuir carga o ampliar turnos.'
      : newUtilization > 85 
      ? 'La línea estará cerca del límite. Monitorear eficiencia de activos.'
      : 'Carga manejable dentro de los parámetros actuales.'
  };
}
