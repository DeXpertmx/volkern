import { prisma } from '@/lib/db';
import crypto from 'crypto';

export interface AuditLogData {
  tenantId: string;
  userId: string;
  action: string;
  resourceType: string;
  resourceId: string;
  details: string;
  metadata?: any;
}

export class AuditService {
  /**
   * Registra una acción en el log de auditoría con un sello criptográfico (Protocolo de Confianza)
   */
  static async log(data: AuditLogData) {
    const secret = process.env.AUDIT_SECRET || 'volkern_secret_key';
    const timestamp = new Date().toISOString();
    const dbUserId = data.userId === 'SYSTEM' ? null : data.userId;
    
    // Crear el payload para el hash usando el ID que quedará en la DB
    const payload = `${data.tenantId}|${dbUserId}|${data.action}|${data.resourceId}|${timestamp}|${data.details}`;
    
    // Generar el HMAC SHA256 (El "Sello")
    const hash = crypto.createHmac('sha256', secret)
      .update(payload)
      .digest('hex');

    try {
      return await prisma.auditLog.create({
        data: {
          tenantId: data.tenantId,
          userId: data.userId === 'SYSTEM' ? null : data.userId,
          accion: data.action,
          entidad: data.resourceType,
          entidadId: data.resourceId,
          descripcion: data.details,
          metadata: {
            ...data.metadata,
            sealedAt: timestamp,
            sealVersion: '1.0'
          },
          hash: hash
        }
      });
    } catch (error) {
      console.error('[AuditService] Error logging audit action:', error);
      // No bloqueamos la operación principal si falla la auditoría, 
      // pero en producción esto debería ser crítico.
    }
  }

  /**
   * Verifica si un log de auditoría ha sido alterado
   */
  static verifySeal(log: any): boolean {
    const secret = process.env.AUDIT_SECRET || 'volkern_secret_key';
    const sealedAt = log.metadata?.sealedAt;
    
    if (!sealedAt || !log.hash) return false;

    const payload = `${log.tenantId}|${log.userId}|${log.accion}|${log.entidadId}|${sealedAt}|${log.descripcion}`;
    const computedHash = crypto.createHmac('sha256', secret)
      .update(payload)
      .digest('hex');

    return computedHash === log.hash;
  }
}
