import { NextResponse } from 'next/server';
import { prisma } from '../../../../../lib/db';
import { FiscalAuditService } from '../../../../../lib/fiscal/audit-service';

/**
 * API para la Torre de Control Fiscal (Agencia)
 * Expone el estado de salud de todos los tenants administrados.
 */
export async function GET() {
  try {
    const tenants = await prisma.tenant.findMany({
      select: {
          id: true,
          nombre: true,
          slug: true,
          plan: true
      }
    });

    const summary = [];

    for (const tenant of tenants) {
      const report = await FiscalAuditService.auditTenant(tenant.id);
      summary.push({
        id: tenant.id,
        nombre: tenant.nombre,
        slug: tenant.slug,
        status: report.status,
        invoices: report.totalInvoices,
        breachesCount: report.breaches.length,
        lastAudit: report.lastAuditDate
      });
    }

    return NextResponse.json({
        success: true,
        timestamp: new Date(),
        tenants: summary,
        totalSummary: {
            total: tenants.length,
            integros: summary.filter(t => t.status === 'ÍGTEGRA').length,
            comprometidos: summary.filter(t => t.status === 'COMPROMETIDA').length
        }
    });
  } catch (error: any) {
    console.error('Error fetching fiscal health:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
