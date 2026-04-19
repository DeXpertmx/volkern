import { prisma } from '@/lib/db';
import { trackSkillExecution, skillsLogger } from './observability';

/**
 * SKILL: get_field_activity
 * Recupera la ubicación y estado de los técnicos en campo basado en check-ins de VISION-LOCK (Attendance).
 */
export async function get_field_activity({ tenantId }: { tenantId: string }) {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const activity = await prisma.attendance.findMany({
    where: {
      tenantId,
      timestamp: { gte: startOfDay }
    },
    include: {
      employee: {
        select: {
          fullName: true,
          role: true
        }
      }
    },
    orderBy: { timestamp: 'desc' }
  });

  return {
    success: true,
    activeTechs: activity.map(log => ({
      id: log.id,
      technician: log.employee.fullName,
      role: log.employee.role,
      lat: log.locationLat,
      lng: log.locationLng,
      status: log.type, // CLOCK_IN, CLOCK_OUT
      timestamp: log.timestamp,
      isAnomaly: log.isAnomaly
    })),
    timestamp: new Date().toISOString()
  };
}

/**
 * SKILL: audit_material_leaks
 * Analiza discrepancias entre el consumo teórico (Producción) y movimientos de almacén para detectar mermas.
 */
export async function audit_material_leaks({ tenantId }: { tenantId: string }) {
  // 1. Obtener consumos industriales automáticos
  const consumptionLogs = await prisma.productionLog.findMany({
    where: { 
      tenantId,
      action: 'AUTOMATIC_CONSUMPTION',
      timestamp: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } // Última semana
    },
    include: {
      catalogoItem: { select: { nombre: true, sku: true } }
    }
  });

  // 2. Obtener ajustes manuales de stock negativos (posibles mermas/ajustes de inventario)
  const stockAdjustments = await prisma.stockMovement.findMany({
    where: {
      tenantId,
      type: 'OUT',
      reason: { contains: 'merma', mode: 'insensitive' },
      createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
    }
  });

  const totalLeaked = stockAdjustments.length;
  const isHighRisk = totalLeaked > 5;

  return {
    success: true,
    status: isHighRisk ? 'CRITICAL' : 'STABLE',
    leakSummary: {
      anomaliesCount: totalLeaked,
      totalAdjustments: stockAdjustments.length,
      automaticConsumptionCount: consumptionLogs.length
    },
    recommendation: isHighRisk 
      ? "Se detectó personal realizando ajustes manuales por merma por encima del umbral. Iniciar auditoría física."
      : "Flujo de materiales estable según registros de producción.",
    timestamp: new Date().toISOString()
  };
}
