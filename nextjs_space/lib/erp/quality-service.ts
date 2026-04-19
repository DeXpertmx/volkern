import { prisma } from '@/lib/db';
import { StockService } from '@/lib/erp/stock-service';
import { AuditLogService } from '@/lib/erp/audit-log-service';

export class QualityService {
  /**
   * Registra un resultado de inspección (Quality Check)
   */
  static async recordInspection(data: {
    tenantId: string;
    pointId: string;
    status: 'PASSED' | 'FAILED';
    workOrderId?: string;
    lotId?: string;
    measuredValue?: string;
    notes?: string;
    inspectorId?: string;
    evidenceUrl?: string;
  }) {
    return await prisma.$transaction(async (tx) => {
      // 1. Crear el registro de inspección
      const check = await tx.qualityCheck.create({
        data: {
          tenantId: data.tenantId,
          pointId: data.pointId,
          status: data.status,
          workOrderId: data.workOrderId,
          inventoryLotId: data.lotId,
          measuredValue: data.measuredValue,
          notes: data.notes,
          inspectorId: data.inspectorId,
          evidenceUrl: data.evidenceUrl
        },
        include: { point: true }
      });

      // 2. Si es un lote y el resultado es PASSED, evaluar liberación de CUARENTENA
      if (data.lotId && data.status === 'PASSED') {
        const allChecks = await tx.qualityCheck.findMany({
          where: { inventoryLotId: data.lotId, tenantId: data.tenantId },
          include: { point: true }
        });

        // Verificamos si todos los puntos obligatorios han pasado
        // En una implementación real, aquí cruzaríamos con la lista de puntos definidos para la familia
        const failedMandatory = allChecks.some(qc => qc.point.mandatory && qc.status === 'FAILED');
        
        if (!failedMandatory) {
          await tx.inventoryLot.update({
            where: { id: data.lotId },
            data: { status: 'AVAILABLE' }
          });
        }
      }

      // 3. Si el resultado es FAILED, abrir No Conformidad automáticamente
      if (data.status === 'FAILED') {
        await tx.nonConformity.create({
          data: {
            tenantId: data.tenantId,
            workOrderId: data.workOrderId,
            description: `Fallo en inspección: ${check.point.name}. Valor medido: ${data.measuredValue}`,
            severity: check.point.mandatory ? 'HIGH' : 'MEDIUM',
            status: 'OPEN',
            reportedBy: data.inspectorId || 'SYSTEM'
          }
        });

        // Si es un lote, marcar como REJECTED
        if (data.lotId) {
          await tx.inventoryLot.update({
            where: { id: data.lotId },
            data: { status: 'REJECTED' }
          });
        }
      }

      return check;
    });
  }
}
