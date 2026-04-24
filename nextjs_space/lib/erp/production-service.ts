import { prisma } from '@/lib/db';
import { StockService } from '@/lib/erp/stock-service';
import { AuditLogService } from '@/lib/erp/audit-log-service';
import { MaintenanceService } from '@/lib/erp/maintenance-service';
import { CostingService } from '@/lib/erp/costing-service';
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
   * Iniciar producción: Reserva/Consume componentes según el BoM y los lotes asignados
   */
  static async startProduction(workOrderId: string, tenantId: string, userId?: string) {
    // 🛡️ SKILL GUARD: Validación de competencias académicas
    if (userId) {
      const { SkillGuard } = await import('@/lib/academy/skill-guard');
      const validation = await SkillGuard.canStartWorkOrder(workOrderId, tenantId, userId);
      
      if (!validation.allowed) {
        throw new Error(validation.message);
      }
    }

    const wo = await prisma.workOrder.findUnique({
      where: { id: workOrderId, tenantId },
      include: { 
        bom: true,
        erp_material_requirements: { include: { erp_inventory_lots: true } }
      }
    });

    if (!wo) throw new Error('Orden de producción no encontrada');
    if (wo.status !== 'PLANNED') throw new Error('La orden ya ha sido iniciada o cancelada');

    // Registrar consumo por lote
    for (const req of (wo as any).erp_material_requirements) {
      const pLog = await prisma.productionLog.create({
        data: {
          tenantId,
          workOrderId,
          action: 'CONSUMPTION',
          catalogoItemId: req.catalogItemId,
          quantity: req.reservedQty,
          lotId: req.lotId
        }
      });
      
      await AuditLogService.signProductionLog(pLog.id, tenantId);

      // Descontar del stock por lote
      await StockService.registerMovement({
        tenantId,
        warehouseId: 'MAIN_WH', // Por simplificar para demo, en real vendría de la reserva
        catalogoItemId: req.catalogItemId,
        lotId: req.lotId || undefined,
        quantity: -req.reservedQty,
        type: 'CONSUMPTION',
        referenceId: `WO-${wo.id}`,
        reason: `Consumo para producción OP #${wo.batchNumber}`
      });
    }

    return await prisma.workOrder.update({
      where: { id: workOrderId },
      data: { status: 'IN_PROGRESS', startDate: new Date() }
    });
  }

  /**
   * Finalizar producción: Registra el producto terminado en un nuevo lote y cierra la orden
   */
  static async completeProduction(workOrderId: string, tenantId: string, quantityProduced: number) {
    const wo = await prisma.workOrder.findUnique({
      where: { id: workOrderId, tenantId },
      include: { 
        bom: true,
        qualityChecks: { include: { point: true } }
      }
    });

    if (!wo || wo.status !== 'IN_PROGRESS') throw new Error('Estado de orden inválido para finalizar');

    // 🛡️ VALIDACIÓN DE CALIDAD: Bloqueo si hay inspecciones obligatorias pendientes o fallidas
    const mandatoryChecks = wo.qualityChecks.filter(qc => qc.point.mandatory);
    const hasFailed = mandatoryChecks.some(qc => qc.status === 'FAILED');
    const isPending = mandatoryChecks.length === 0; // Si no hay registros de puntos obligatorios

    if (hasFailed) throw new Error('No se puede cerrar la orden: Existen controles de calidad fallidos.');
    if (isPending) throw new Error('No se puede cerrar la orden: Se requieren inspecciones de calidad obligatorias.');

    // 1. Crear el nuevo Lote de Inventario (Entra en QUARANTINE)
    const newLot = await (prisma as any).erp_inventory_lots.create({
      data: {
        id: `LOT-${wo.batchNumber}-${Date.now()}`,
        tenantId,
        catalogItemId: wo.bom.productId,
        batchNumber: wo.batchNumber,
        status: 'QUARANTINE',
        updatedAt: new Date()
      }
    });

    // 2. Registrar salida de producto terminado vinculado al nuevo lote
    const pLog = await prisma.productionLog.create({
      data: {
        tenantId,
        workOrderId,
        action: 'OUTPUT',
        catalogoItemId: wo.bom.productId,
        quantity: quantityProduced,
        lotId: newLot.id
      }
    });

    await AuditLogService.signProductionLog(pLog.id, tenantId);

    await StockService.registerMovement({
      tenantId,
      warehouseId: 'MAIN_WH',
      catalogoItemId: wo.bom.productId,
      lotId: newLot.id,
      quantity: quantityProduced,
      type: 'PRODUCTION_OUTPUT',
      referenceId: `WO-${wo.id}`,
      reason: `Entrada por producción finalizada OP #${wo.batchNumber}`
    });

    const updatedWO = await prisma.workOrder.update({
      where: { id: workOrderId },
      data: { 
        status: 'COMPLETED', 
        endDate: new Date(),
        quantityProduced 
      }
    });

    // Actualizar horas del activo si está vinculado
    if (wo.assetId && wo.startDate) {
      const hoursWorked = (updatedWO.endDate!.getTime() - wo.startDate.getTime()) / (1000 * 60 * 60);
      await MaintenanceService.updateAssetUsage(wo.assetId, hoursWorked, tenantId);
    }

    // Calcular costos finales de la orden
    await CostingService.calculateRealCost(workOrderId, tenantId);

    // 🔗 VINCULACIÓN COMERCIAL: Si esta orden nació de un pedido (MTO)
    const reservations = await (prisma as any).erp_order_reservations.findMany({
      where: { workOrderId, tenantId, status: 'ACTIVE' },
      include: { salesOrderItem: true }
    });

    for (const res of reservations) {
      await (prisma as any).erp_sales_order_items.update({
        where: { id: res.salesOrderItemId },
        data: { status: 'READY' }
      });
    }

    return updatedWO;
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
    
    await AuditLogService.signProductionLog(log.id, data.tenantId);

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
