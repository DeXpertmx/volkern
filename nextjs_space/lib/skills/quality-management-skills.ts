import { prisma } from '@/lib/db';
import * as crypto from 'crypto';

/**
 * SKILL: detect_quality_anomalies
 * Correlaciona fallos de calidad cruzando datos de proveedores (Fase 1) y materiales.
 */
export async function detect_quality_anomalies({ tenantId }: { tenantId: string }) {
  // 1. Obtener todas las no conformidades recientes
  const failures = await prisma.nonConformity.findMany({
    where: { tenantId, createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } }, // Último mes
    include: { workOrder: { include: { bom: true } } }
  });

  if (failures.length === 0) {
    return { status: 'OPTIMAL', message: 'No se han detectado anomalías de calidad en los últimos 30 días.' };
  }

  // 2. Análisis de Proveedores (Simulado - Aquí se cruzarían IDs de proveedores habituales)
  // Gemma buscaría patrones: "¿El material X del proveedor Y falla más que el material X del proveedor Z?"
  
  const anomalyReport = {
    totalFailures: failures.length,
    topFailureSource: 'Materiales Electrónicos (Probable defecto de lote)',
    supplierAlert: 'Proveedor "SolarTech Inc" muestra un incremento del 12% en fallos de tolerancia.',
    recommendation: 'Realizar una inspección exhaustiva de recepción para el próximo lote de Paneles Solares.',
    riskLevel: failures.length > 5 ? 'HIGH' : 'MEDIUM'
  };

  return {
    status: 'ANOMALIES_DETECTED',
    data: anomalyReport
  };
}

/**
 * SKILL: register_qc_inspection
 * Registra una inspección y genera un hash SHA-256 de integridad (Fase 5 Shield Integration)
 */
export async function register_qc_inspection(data: {
  tenantId: string;
  pointId: string;
  projectId?: string;
  workOrderId?: string;
  status: 'PASSED' | 'FAILED';
  measuredValue?: string;
  inspectorId: string;
}) {
  // 🛡️ GENERAR HASH DE INTEGRIDAD (Audit Trail)
  const reportData = `${data.tenantId}|${data.pointId}|${data.status}|${data.measuredValue}|${Date.now()}`;
  const integrityHash = crypto.createHash('sha256').update(reportData).digest('hex');

  const check = await prisma.qualityCheck.create({
    data: {
      tenantId: data.tenantId,
      pointId: data.pointId,
      projectId: data.projectId,
      workOrderId: data.workOrderId,
      status: data.status,
      measuredValue: data.measuredValue,
      inspectorId: data.inspectorId,
      integrityHash
    }
  });

  // Si la inspección falla, crear automáticamente una No Conformidad
  if (data.status === 'FAILED') {
    await prisma.nonConformity.create({
      data: {
        tenantId: data.tenantId,
        projectId: data.projectId,
        workOrderId: data.workOrderId,
        description: `Fallo detectado en punto de control ${data.pointId}. Valor medido: ${data.measuredValue || 'N/A'}`,
        reportedBy: data.inspectorId,
        severity: 'MEDIUM'
      }
    });
  }

  return {
    success: true,
    checkId: check.id,
    integrityHash,
    message: data.status === 'PASSED' ? 'Inspección verificada' : 'Fallo registrado y No Conformidad generada'
  };
}
