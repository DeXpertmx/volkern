import { prisma } from '@/lib/db';
import crypto from 'crypto';

export class AuditLogService {
  /**
   * Genera un hash para una entrada de log de producción y la encadena con la anterior
   */
  static async signProductionLog(logId: string, tenantId: string) {
    const log = await prisma.productionLog.findUnique({
      where: { id: logId, tenantId }
    });

    if (!log) return;

    // Buscar el log anterior para obtener su hash
    const lastLog = await prisma.productionLog.findFirst({
      where: { 
        tenantId,
        id: { not: logId },
        timestamp: { lt: log.timestamp }
      },
      orderBy: { timestamp: 'desc' }
    });

    const previousHash = lastLog?.currentHash || '00000000000000000000000000000000';
    
    // Crear data para el hash
    const dataToHash = JSON.stringify({
      id: log.id,
      tenantId: log.tenantId,
      action: log.action,
      quantity: log.quantity,
      timestamp: log.timestamp,
      previousHash
    });

    const currentHash = crypto.createHash('sha256').update(dataToHash).digest('hex');

    await prisma.productionLog.update({
      where: { id: logId },
      data: {
        previousHash,
        currentHash
      }
    });
  }
}
