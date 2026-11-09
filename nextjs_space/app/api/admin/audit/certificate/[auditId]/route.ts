import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { isAdminRequest } from '@/lib/auth-helpers';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/audit/certificate/[auditId]
 * Devuelve los datos completos de un AuditVault formateados para el Certificado de Cumplimiento.
 * El frontend renderiza el HTML y usa window.print() para generar el PDF.
 */
export async function GET(
  request: NextRequest,
  { params: paramsPromise }: { params: Promise<{ auditId: string }> }
) {
  const params = await paramsPromise;
  const authResult = await isAdminRequest(request);
  if (!authResult.ok) {
    return NextResponse.json({ error: authResult.error }, { status: 401 });
  }

  const { auditId } = params;

  const record = await prisma.auditVault.findUnique({
    where: { id: auditId },
  });

  if (!record) {
    return NextResponse.json({ error: 'Registro de auditoría no encontrado' }, { status: 404 });
  }

  // Verificar integridad de la cadena
  let chainValid = true;
  if (record.prevHash) {
    const prevRecord = await prisma.auditVault.findFirst({
      where: { integrityHash: record.prevHash },
      select: { id: true, integrityHash: true },
    });
    chainValid = !!prevRecord;
  }

  // Número de certificado formateado
  const certNumber = `VLK-AUDIT-${record.auditDate.getFullYear()}-${String(record.auditDate.getMonth() + 1).padStart(2, '0')}-${auditId.slice(-6).toUpperCase()}`;

  // Calcular índice de equidad (porcentaje legible para el certificado)
  const equityIndex = Math.max(0, Math.round((1 - record.biasScore) * 100));

  return NextResponse.json({
    success: true,
    certificate: {
      certNumber,
      equityIndex,
      record,
      chainValid,
      generatedAt: new Date().toISOString(),
      systemVersion: 'Volkern ERP v2.0 — Módulo de Cumplimiento Ético',
      legalFramework: 'AI Act UE (2024/1689) · RGPD (2016/679) · LOPD-GDD (3/2018)',
    },
  });
}
