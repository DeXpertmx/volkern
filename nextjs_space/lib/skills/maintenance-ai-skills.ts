import { prisma } from '@/lib/db';
import { MaintenanceService } from '@/lib/erp/maintenance-service';

/**
 * SKILL: predict_asset_failure
 * Analiza el historial de un activo para predecir fallos inminentes
 */
export async function predict_asset_failure({ tenantId, assetId }: { tenantId: string, assetId: string }) {
  const asset = await prisma.industrialAsset.findUnique({
    where: { id: assetId, tenantId },
    include: {
      maintenanceOrders: { orderBy: { plannedDate: 'desc' }, take: 5 },
      workOrders: { where: { status: 'COMPLETED' }, orderBy: { endDate: 'desc' }, take: 10 }
    }
  });

  if (!asset) throw new Error('Activo no encontrado');

  // Lógica de predicción simulada (en fase real se enviaría a Gemma)
  const usageIntensity = asset.workOrders.length > 5 ? 'HIGH' : 'NORMAL';
  const hoursSinceLastMaintenance = asset.lastMaintenanceDate 
    ? (Date.now() - asset.lastMaintenanceDate.getTime()) / (1000 * 60 * 60)
    : asset.totalHoursWorked;

  const failureProbability = (hoursSinceLastMaintenance / 1000) * (usageIntensity === 'HIGH' ? 1.5 : 1.0);

  return {
    assetName: asset.name,
    failureProbability: Math.min(failureProbability, 0.99),
    estimatedDaysToFailure: Math.max(Math.floor((1000 - hoursSinceLastMaintenance) / 24), 1),
    recommendation: failureProbability > 0.7 
      ? 'URGENTE: Se recomienda mantenimiento preventivo inmediato para evitar parada crítica.'
      : 'ESTADO ÓPTIMO: Continuar con monitoreo regular.'
  };
}

/**
 * SKILL: get_maintenance_dashboard
 * Obtiene el estado de salud de todos los activos
 */
export async function get_maintenance_dashboard({ tenantId }: { tenantId: string }) {
  return await MaintenanceService.getAssetsHealth(tenantId);
}
