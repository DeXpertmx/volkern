import * as crypto from 'crypto';
import { prisma } from '@/lib/db';

export interface AuditHashInput {
  tenantId: string;
  userId: string | null;
  entity: string;
  entityId: string;
  action: string;
  description: string;
  timestamp: Date;
  previousHash: string | null;
  changesBefore?: any;
  changesAfter?: any;
}

export interface AuditIntegrityResult {
  valid: boolean;
  expectedHash: string | null;
  actualHash: string | null;
  error?: string;
}

export interface ChainVerificationResult {
  valid: boolean;
  brokenAtIndex?: number;
  totalEntries: number;
  verifiedEntries: number;
  errors: string[];
}

const GENESIS_HASH = '0000000000000000000000000000000000000000000000000000000000000000';

export function createAuditHash(data: AuditHashInput): string {
  const payload = [
    data.tenantId,
    data.userId || '',
    data.entity,
    data.entityId,
    data.action,
    data.description,
    data.timestamp.toISOString(),
    data.previousHash || GENESIS_HASH,
    data.changesBefore ? JSON.stringify(data.changesBefore) : '',
    data.changesAfter ? JSON.stringify(data.changesAfter) : ''
  ].join('|');

  return crypto.createHash('sha256').update(payload).digest('hex');
}

export function verifyAuditIntegrity(
  tenantId: string,
  auditLogId: string
): Promise<AuditIntegrityResult> {
  return new Promise(async (resolve) => {
    try {
      const auditLog = await prisma.auditLog.findFirst({
        where: { id: auditLogId, tenantId },
        orderBy: { fechaCreacion: 'asc' }
      });

      if (!auditLog) {
        resolve({ valid: false, expectedHash: null, actualHash: null, error: 'Audit log not found' });
        return;
      }

      const previousHash = (auditLog.metadata as any)?.previousHash || null;
      const timestamp = auditLog.fechaCreacion;

      const expectedHash = (createAuditHash as any)({
        tenantId: auditLog.tenantId,
        userId: auditLog.userId ?? '',
        entity: auditLog.entidad,
        entityId: auditLog.entidadId,
        action: auditLog.accion,
        description: auditLog.descripcion,
        timestamp: timestamp,
        previousHash: previousHash,
        changesBefore: auditLog.cambiosAntes,
        changesAfter: auditLog.cambiosDespues
      });

      const isValid = expectedHash === auditLog.hash;

      resolve({
        valid: isValid,
        expectedHash,
        actualHash: auditLog.hash,
        error: isValid ? undefined : 'Hash mismatch - audit log may have been tampered with'
      });
    } catch (error) {
      resolve({
        valid: false,
        expectedHash: null,
        actualHash: null,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });
}

export async function getPreviousHash(tenantId: string, beforeDate?: Date): Promise<string | null> {
  try {
    const lastLog = await prisma.auditLog.findFirst({
      where: {
        tenantId,
        ...(beforeDate ? { fechaCreacion: { lt: beforeDate } } : {})
      },
      orderBy: { fechaCreacion: 'desc' },
      select: { hash: true }
    });

    return lastLog?.hash || null;
  } catch (error) {
    console.error('[AuditHash] Error getting previous hash:', error);
    return null;
  }
}

export async function createAuditHashChain(
  tenantId: string,
  fromDate?: Date,
  toDate?: Date
): Promise<ChainVerificationResult> {
  const result: ChainVerificationResult = {
    valid: true,
    totalEntries: 0,
    verifiedEntries: 0,
    errors: []
  };

  try {
    const entries = await prisma.auditLog.findMany({
      where: {
        tenantId,
        ...(fromDate ? { fechaCreacion: { gte: fromDate } } : {}),
        ...(toDate ? { fechaCreacion: { lte: toDate } } : {})
      },
      orderBy: { fechaCreacion: 'asc' },
      select: {
        id: true,
        hash: true,
        fechaCreacion: true,
        accion: true,
        entidad: true,
        entidadId: true,
        metadata: true
      }
    });

    result.totalEntries = entries.length;

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      const previousEntry = i > 0 ? entries[i - 1] : null;
      const previousHash = previousEntry?.hash || null;

      if (!entry.hash) {
        result.valid = false;
        result.errors.push(`Entry ${i + 1} (${entry.id}) has no hash`);
        result.brokenAtIndex = i;
        continue;
      }

      const computedHash = createAuditHash({
        tenantId,
        userId: (entry.metadata as any)?.userId || null,
        entity: entry.entidad,
        entityId: entry.entidadId,
        action: entry.accion,
        description: '',
        timestamp: entry.fechaCreacion,
        previousHash
      });

      if (computedHash !== entry.hash) {
        result.valid = false;
        result.errors.push(
          `Chain broken at entry ${i + 1} (${entry.id}): expected ${computedHash}, got ${entry.hash}`
        );
        result.brokenAtIndex = i;
      } else {
        result.verifiedEntries++;
      }
    }

    return result;
  } catch (error) {
    result.valid = false;
    result.errors.push(error instanceof Error ? error.message : 'Unknown error during chain verification');
    return result;
  }
}

export function generateGenesisHash(): string {
  return GENESIS_HASH;
}

export { GENESIS_HASH };