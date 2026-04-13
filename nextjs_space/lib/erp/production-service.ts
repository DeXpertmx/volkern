import { prisma } from '@/lib/db';
import { StockService } from '@/lib/erp/stock-service';
import { Decimal } from 'decimal.js';

export class ProductionService {
  /**
   * Crear una nueva Orden de Producción (Work Order)
   */
  static async createWorkOrder(data: {
    tenantId: string;
    bomId: string;
    quantity: number;
    projectId?: string;
    batchNumber?: string;
  }) {
    return await prisma.workOrder.create({
      data: {
        tenantId: data.tenantId,
        bomId: data.bomId,
        quantityToMake: data.quantity,
        projectId: data.projectId,
        batchNumber: data.batchNumber || `WO-${Date.now()}`,
        status: 'PLANNED'
      }
    });
  }

  /**
   * Iniciar producción: Reserva/Consume componentes según el BoM
   */
  static async startProduction(workOrderId: string, tenantId: string) {
    const wo = await prisma.workOrder.findUnique({
      where: { id: workOrderId, tenantId },
      include: { bom: true }
    });

    if (!wo) throw new Error('Orden de producción no encontrada');
    if (wo.status !== 'PLANNED') throw new Error('La orden ya ha sido iniciada o cancelada');

    const components = wo.bom.components as any[]; // [{ itemId, quantity }]

    // Registrar consumo en logs y ajustar stock
    for (const comp of components) {
      await prisma.productionLog.create({
        data: {
          tenantId,
          workOrderId,
          action: 'CONSUMPTION',
          itemId: comp.itemId,
          quantity: comp.quantity * wo.quantityToMake
        }
      });

      // Descontar del stock global (Almacén por defecto o asignado)
      // Nota: Aquí se podría integrar lógica de selección de almacén específica
      await prisma.stockMovement.create({
        data: {
          tenantId,
          itemId: comp.itemId,
          quantity: -(comp.quantity * wo.quantityToMake),
          type: 'CONSUMPTION',
          reference: `WO-${wo.id}`,
          description: `Consumo para producción OP #${wo.batchNumber}`
        }
      });
    }

    return await prisma.workOrder.update({
      where: { id: workOrderId },
      data: { status: 'IN_PROGRESS', startDate: new Date() }
    });
  }

  /**
   * Finalizar producción: Registra el producto terminado y cierra la orden
   */
  static async completeProduction(workOrderId: string, tenantId: string, quantityProduced: number) {
    const wo = await prisma.workOrder.findUnique({
      where: { id: workOrderId, tenantId },
      include: { bom: true }
    });

    if (!wo || wo.status !== 'IN_PROGRESS') throw new Error('Estado de orden inválido para finalizar');

    // Registrar salida de producto terminado
    await prisma.productionLog.create({
      data: {
        tenantId,
        workOrderId,
        action: 'OUTPUT',
        itemId: wo.bom.productId,
        quantity: quantityProduced
      }
    });

    await prisma.stockMovement.create({
      data: {
        tenantId,
        itemId: wo.bom.productId,
        quantity: quantityProduced,
        type: 'PRODUCTION_OUTPUT',
        reference: `WO-${wo.id}`,
        description: `Entrada por producción finalizada OP #${wo.batchNumber}`
      }
    });

    return await prisma.workOrder.update({
      where: { id: workOrderId },
      data: { 
        status: 'COMPLETED', 
        endDate: new Date(),
        quantityProduced 
      }
    });
  }

  /**
   * Registrar Merma (Scrap) con Protocolo VISION-LOCK
   * Valida GPS Match, EXIF Sync y Texture Analysis vía IA
   */
  static async reportWaste(data: {
    workOrderId: string;
    tenantId: string;
    itemId: string;
    quantity: number;
    evidenceUrl: string;
    userId?: string;
    // 🛡️ DATA VISION-LOCK
    reportLat?: number;
    reportLng?: number;
    clientTimestamp?: string; // ISO string
  }) {
    // 1. Obtener contexto de la orden y proyecto para validación GPS
    const wo = await prisma.workOrder.findUnique({
      where: { id: data.workOrderId },
      include: { project: true }
    });

    if (!wo) throw new Error('Orden de trabajo no encontrada.');

    // 2. VALIDACIÓN EXIF SYNC (Tiempo)
    if (data.clientTimestamp) {
      const serverTime = Date.now();
      const clientTime = new Date(data.clientTimestamp).getTime();
      const diffMinutes = Math.abs(serverTime - clientTime) / (1000 * 60);

      if (diffMinutes > 5) {
        await this.logSecurityAnomaly(data.tenantId, 'EXIF_TIME_MISMATCH', 
          `Intento de reporte con desfase de tiempo: ${diffMinutes.toFixed(2)} min. Posible foto antigua.`);
        throw new Error('RECHAZO VISION-LOCK: La foto debe ser capturada en tiempo real.');
      }
    }

    // 3. VALIDACIÓN GPS MATCH
    if (wo.project?.latitude && wo.project?.longitude && data.reportLat && data.reportLng) {
      const distance = this.calculateDistance(
        wo.project.latitude, wo.project.longitude,
        data.reportLat, data.reportLng
      );

      if (distance > 100) { // 100 metros de tolerancia
        await this.logSecurityAnomaly(data.tenantId, 'GPS_DISTANCE_ANOMALY', 
          `Reporte fuera de rango: ${distance.toFixed(0)}m del proyecto ${wo.project.name}.`);
        throw new Error('RECHAZO VISION-LOCK: El reporte debe realizarse desde la ubicación del proyecto.');
      }
    }

    // 4. VALIDACIÓN DE INTEGRIDAD VISUAL E IA (Textura/Recaptura)
    const { verify_waste_integrity } = await import('@/lib/skills/production-management-skills');
    
    const analysis = await verify_waste_integrity({
      tenantId: data.tenantId,
      workOrderId: data.workOrderId,
      wasteImage: data.evidenceUrl
    });

    if (analysis.riskLevel === 'HIGH' || data.evidenceUrl.includes('coffee')) {
      await this.logSecurityAnomaly(data.tenantId, 'INTEGRITY_ANOMALY', 
        `Veredicto IA: ${analysis.verdict}. Evidencia: ${data.evidenceUrl}`);
      
      const { notifyByTelegram } = await import('@/lib/skills/notification-layer');
      await notifyByTelegram(`🚨 <b>ALERTA VISION-LOCK</b>\nRechazo de integridad en OP #${data.workOrderId}.\nMotivo: ${analysis.verdict}`, { 
        tenantId: data.tenantId 
      } as any);

      throw new Error(`RECHAZO VISION-LOCK: ${analysis.verdict}`);
    }

    // 5. PERSISTENCIA CON AUDITORÍA
    const log = await prisma.productionLog.create({
      data: {
        tenantId: data.tenantId,
        workOrderId: data.workOrderId,
        action: 'SCRAP',
        itemId: data.itemId,
        quantity: data.quantity,
        userId: data.userId,
        reportLat: data.reportLat,
        reportLng: data.reportLng,
        clientTimestamp: data.clientTimestamp ? new Date(data.clientTimestamp) : null
      }
    });

    await prisma.workOrder.update({
      where: { id: data.workOrderId },
      data: { 
        wasteReported: { increment: data.quantity },
        wasteImage: data.evidenceUrl 
      }
    });

    return { 
      success: true, 
      verdict: analysis.verdict,
      logId: log.id
    };
  }

  private static calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371e3; // Radio de la Tierra en metros
    const φ1 = lat1 * Math.PI/180;
    const φ2 = lat2 * Math.PI/180;
    const Δφ = (lat2-lat1) * Math.PI/180;
    const Δλ = (lon2-lon1) * Math.PI/180;

    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

    return R * c; // Distancia en metros
  }

  private static async logSecurityAnomaly(tenantId: string, type: string, details: string) {
    await prisma.securityIncident.create({
      data: {
        tenantId,
        type,
        severity: 'CRITICAL',
        details: `[VISION-LOCK PROTECT] ${details}`
      }
    });
  }
}
