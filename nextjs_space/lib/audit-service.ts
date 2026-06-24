import { prisma } from '@/lib/db';
import * as crypto from 'crypto';
import { createAuditHash, getPreviousHash, GENESIS_HASH } from './audit-hash';

export interface AuditLogInput {
  tenantId: string;
  userId?: string;
  action: string;
  entity: string;
  entityId: string;
  description: string;
  changesBefore?: any;
  changesAfter?: any;
  ipAddress?: string;
  userAgent?: string;
  metadata?: any;
}

export interface AuditFilters {
  tenantId?: string;
  userId?: string;
  entity?: string;
  entityId?: string;
  action?: string;
  fromDate?: Date;
  toDate?: Date;
}

export class AuditService {
  static async log(input: AuditLogInput) {
    const timestamp = new Date();
    const previousHash = await getPreviousHash(input.tenantId, timestamp);
    const dbUserId = input.userId === 'SYSTEM' || !input.userId ? null : input.userId;

    const hash = createAuditHash({
      tenantId: input.tenantId,
      userId: dbUserId,
      entity: input.entity,
      entityId: input.entityId,
      action: input.action,
      description: input.description,
      timestamp,
      previousHash,
      changesBefore: input.changesBefore,
      changesAfter: input.changesAfter
    });

    try {
      return await prisma.auditLog.create({
        data: {
          tenantId: input.tenantId,
          userId: dbUserId,
          accion: input.action,
          entidad: input.entity,
          entidadId: input.entityId,
          descripcion: input.description,
          cambiosAntes: input.changesBefore,
          cambiosDespues: input.changesAfter,
          ipAddress: input.ipAddress,
          userAgent: input.userAgent,
          fechaCreacion: timestamp,
          hash,
          metadata: {
            ...input.metadata,
            previousHash,
            chainVersion: '2.0',
            sealedAt: timestamp.toISOString()
          }
        }
      });
    } catch (error) {
      console.error('[AuditService] Error logging audit action:', error);
      return null;
    }
  }

  static async getAuditTrail(entity: string, entityId: string, tenantId?: string) {
    return await prisma.auditLog.findMany({
      where: {
        entidad: entity,
        entidadId: entityId,
        ...(tenantId ? { tenantId } : {})
      },
      orderBy: { fechaCreacion: 'desc' },
      include: { user: { select: { id: true, name: true, email: true } } }
    });
  }

  static async getTenantAuditTrail(
    tenantId: string,
    from?: Date,
    to?: Date,
    options?: { skip?: number; take?: number }
  ) {
    return await prisma.auditLog.findMany({
      where: {
        tenantId,
        ...(from ? { fechaCreacion: { gte: from } } : {}),
        ...(to ? { fechaCreacion: { lte: to } } : {})
      },
      orderBy: { fechaCreacion: 'desc' },
      skip: options?.skip || 0,
      take: options?.take || 100,
      include: { user: { select: { id: true, name: true, email: true } } }
    });
  }

  static async getUserAuditTrail(userId: string, tenantId?: string) {
    return await prisma.auditLog.findMany({
      where: {
        userId,
        ...(tenantId ? { tenantId } : {})
      },
      orderBy: { fechaCreacion: 'desc' },
      take: 100
    });
  }

  static async exportAuditTrail(filters: AuditFilters, format: 'json' | 'csv' = 'json') {
    const { tenantId, userId, entity, entityId, action, fromDate, toDate } = filters;

    const logs = await prisma.auditLog.findMany({
      where: {
        ...(tenantId ? { tenantId } : {}),
        ...(userId ? { userId } : {}),
        ...(entity ? { entidad: entity } : {}),
        ...(entityId ? { entidadId: entityId } : {}),
        ...(action ? { accion: action } : {}),
        ...(fromDate ? { fechaCreacion: { gte: fromDate } } : {}),
        ...(toDate ? { fechaCreacion: { lte: toDate } } : {})
      },
      orderBy: { fechaCreacion: 'desc' },
      include: { user: { select: { id: true, name: true, email: true } } }
    });

    if (format === 'csv') {
      const headers = [
        'ID', 'Tenant ID', 'User ID', 'Action', 'Entity', 'Entity ID',
        'Description', 'IP Address', 'User Agent', 'Timestamp', 'Hash', 'Previous Hash'
      ].join(',');

      const rows = logs.map(log => [
        log.id,
        log.tenantId,
        log.userId || '',
        log.accion,
        log.entidad,
        log.entidadId,
        `"${(log.descripcion || '').replace(/"/g, '""')}"`,
        log.ipAddress || '',
        log.userAgent ? `"${log.userAgent.replace(/"/g, '""')}"` : '',
        log.fechaCreacion.toISOString(),
        log.hash || '',
        (log.metadata as any)?.previousHash || ''
      ].join(','));

      return [headers, ...rows].join('\n');
    }

    return logs;
  }

  static async anonymizeUserData(userId: string, tenantId: string) {
    const logs = await prisma.auditLog.findMany({
      where: { userId, tenantId }
    });

    for (const log of logs) {
      await prisma.auditLog.update({
        where: { id: log.id },
        data: {
          metadata: {
            ...(log.metadata as any),
            anonymizedAt: new Date().toISOString(),
            originalUserId: log.userId
          },
          userId: null
        }
      });
    }

    return { anonymizedCount: logs.length };
  }

  static async getUserDataExport(userId: string, tenantId: string) {
    const logs = await prisma.auditLog.findMany({
      where: { userId, tenantId },
      orderBy: { fechaCreacion: 'desc' }
    });

    return {
      userId,
      tenantId,
      exportDate: new Date().toISOString(),
      totalEntries: logs.length,
      entries: logs.map(log => ({
        id: log.id,
        action: log.accion,
        entity: log.entidad,
        entityId: log.entidadId,
        description: log.descripcion,
        timestamp: log.fechaCreacion,
        ipAddress: log.ipAddress
      }))
    };
  }

  static verifySeal(log: any): boolean {
    if (!log.hash || !log.metadata?.sealedAt) return false;

    const payload = [
      log.tenantId,
      log.userId || '',
      log.entidad,
      log.entidadId,
      log.accion,
      log.descripcion,
      log.fechaCreacion.toISOString(),
      log.metadata?.previousHash || GENESIS_HASH,
      log.cambiosAntes ? JSON.stringify(log.cambiosAntes) : '',
      log.cambiosDespues ? JSON.stringify(log.cambiosDespues) : ''
    ].join('|');

    const computedHash = crypto.createHash('sha256').update(payload).digest('hex');
    return computedHash === log.hash;
  }
}