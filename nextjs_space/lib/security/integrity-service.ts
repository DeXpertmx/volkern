import { createHash } from 'crypto';
import { prisma } from '@/lib/db';

/**
 * Generar Hash de Integridad Chained
 * Cada log incluye el hash del log anterior para detectar manipulaciones en la cadena.
 */
export async function generateIntegrityHash(data: any, tenantId: string): Promise<string> {
  // 1. Obtener el último log de este tenant para encadenar
  const lastLog = await prisma.financialAudit.findFirst({
    where: { tenantId },
    orderBy: { timestamp: 'desc' },
    select: { integrityCheck: true }
  });

  const lastHash = lastLog?.integrityCheck || 'SECURE_GENESIS_BLOCK';

  // 2. Crear string a hashear (Data + LastHash)
  const dataString = JSON.stringify(data) + lastHash;
  
  return createHash('sha256').update(dataString).digest('hex');
}

/**
 * Verificar Integridad de la Cadena
 */
export async function verifyFinancialIntegrity(tenantId: string): Promise<boolean> {
  const logs = await prisma.financialAudit.findMany({
    where: { tenantId },
    orderBy: { timestamp: 'asc' }
  });

  let prevHash = 'SECURE_GENESIS_BLOCK';

  for (const log of logs) {
    // Re-calcular hash sin el campo integrityCheck original
    const { integrityCheck, id, ...logContent } = log;
    const dataString = JSON.stringify(logContent) + prevHash;
    const recalculatedHash = createHash('sha256').update(dataString).digest('hex');

    if (recalculatedHash !== integrityCheck) {
      console.error(`Integrity violation found at audit log ID: ${id}`);
      return false;
    }

    prevHash = integrityCheck;
  }

  return true;
}

/**
 * Registrar Incidente de Seguridad
 */
export async function reportSecurityIncident(input: { 
  tenantId: string, 
  type: string, 
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW',
  details: string 
}) {
  return await prisma.securityIncident.create({
    data: {
      tenantId: input.tenantId,
      type: input.type,
      severity: input.severity,
      details: input.details
    }
  });
}
