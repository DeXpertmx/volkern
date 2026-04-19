import { prisma } from '@/lib/db';
import { notifyByTelegram } from '@/lib/skills/notification-layer';
import { Decimal } from 'decimal.js';

export class MaintenanceService {
  /**
   * Actualiza las horas trabajadas de un activo
   */
  static async updateAssetUsage(assetId: string, hours: number, tenantId: string) {
    const asset = await prisma.industrialAsset.findUnique({
      where: { id: assetId, tenantId }
    });

    if (!asset) return;

    const newTotalHours = new Decimal(asset.totalHoursWorked).plus(hours).toNumber();
    
    // Verificar si llegamos al 80% de horas para mantenimiento (ejemplo: cada 1000h)
    // Supongamos que el intervalo es 1000h para este ejemplo
    const threshold = 1000 * 0.8;
    const currentIntervalUsage = newTotalHours % 1000;

    if (currentIntervalUsage >= threshold && (asset.totalHoursWorked % 1000) < threshold) {
      await this.createPreventiveOrder(assetId, tenantId, 'Alerta Preventiva: El activo ha alcanzado el 80% de su ciclo operativo.');
    }

    return await prisma.industrialAsset.update({
      where: { id: assetId },
      data: { totalHoursWorked: newTotalHours }
    });
  }

  /**
   * Crea una orden de mantenimiento preventiva
   */
  static async createPreventiveOrder(assetId: string, tenantId: string, description: string) {
    // Evitar duplicados si ya hay una orden planeada para este activo
    const existing = await prisma.maintenanceOrder.findFirst({
      where: { 
        assetId, 
        tenantId, 
        status: 'PLANNED',
        type: 'PREVENTIVE'
      }
    });

    if (existing) return;

    const order = await prisma.maintenanceOrder.create({
      data: {
        tenantId,
        assetId,
        type: 'PREVENTIVE',
        status: 'PLANNED',
        description,
        plannedDate: new Date(Date.now() + 1000 * 60 * 60 * 24 * 2) // +2 días
      },
      include: { asset: true }
    });

    // Notificar vía Telegram
    await notifyByTelegram(
      `🛠️ <b>ALERTA DE MANTENIMIENTO</b>\n\n` +
      `Activo: <b>${order.asset.name}</b>\n` +
      `Motivo: ${description}\n` +
      `Estado: PLANNED\n` +
      `Fecha sugerida: ${order.plannedDate.toLocaleDateString()}`,
      { tenantId } as any
    );

    return order;
  }

  /**
   * Obtiene la salud de los activos para el dashboard
   */
  static async getAssetsHealth(tenantId: string) {
    const assets = await prisma.industrialAsset.findMany({
      where: { tenantId },
      include: {
        maintenanceOrders: {
          where: { status: 'PLANNED' }
        }
      }
    });

    return assets.map(asset => {
      const usagePercentage = (asset.totalHoursWorked % 1000) / 10;
      return {
        ...asset,
        health: usagePercentage > 90 ? 'CRITICAL' : (usagePercentage > 70 ? 'WARNING' : 'OPTIMAL'),
        usagePercentage
      };
    });
  }
}
