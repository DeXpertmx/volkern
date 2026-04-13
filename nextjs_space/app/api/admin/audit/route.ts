import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { isAdminRequest } from '@/lib/auth-helpers';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/audit
 * Lista el historial de AuditVault con paginación y metadatos de tendencia.
 * Solo accesible para Superadmin / Administrador.
 */
export async function GET(request: NextRequest) {
  const authResult = await isAdminRequest(request);
  if (!authResult.ok) {
    return NextResponse.json({ error: authResult.error }, { status: 401 });
  }

  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get('page') || '1', 10);
  const limit = parseInt(url.searchParams.get('limit') || '20', 10);
  const skip = (page - 1) * limit;

  const [records, total] = await Promise.all([
    prisma.auditVault.findMany({
      orderBy: { auditDate: 'desc' },
      take: limit,
      skip,
    }),
    prisma.auditVault.count(),
  ]);

  // Último registro para KPIs
  const latest = records[0] || null;

  // Verificar integridad de la cadena blockchain (último vs su prevHash)
  let chainIntact = true;
  if (latest && records.length > 1) {
    const prev = records[1];
    chainIntact = latest.prevHash === prev.integrityHash;
  }

  // Estadísticas para el dashboard
  const stats = await prisma.auditVault.aggregate({
    _avg: { biasScore: true, totalRecords: true },
    _max: { biasScore: true },
    _min: { biasScore: true },
  });

  // Tendencia de los últimos 30 días para el gráfico de línea
  const trendData = await prisma.auditVault.findMany({
    orderBy: { auditDate: 'asc' },
    take: 90,
    select: {
      id: true,
      auditDate: true,
      biasScore: true,
      status: true,
      totalRecords: true,
    },
  });

  // Alertas no resueltas
  const unresolvedAlerts = await prisma.systemAlert.count({
    where: { resolved: false },
  });

  // Estado del módulo
  const moduleControl = await prisma.aiModuleControl.findUnique({
    where: { moduleKey: 'random_presence_tests' },
  });

  return NextResponse.json({
    success: true,
    records,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    latest,
    chainIntact,
    stats,
    trendData,
    unresolvedAlerts,
    moduleControl,
  });
}
