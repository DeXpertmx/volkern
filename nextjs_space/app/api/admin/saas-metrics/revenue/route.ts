import { NextRequest, NextResponse } from 'next/server';
import { globalPrisma } from '@/lib/db';
import { SaaSMetricsService } from '@/lib/saas-metrics';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const periodMonths = parseInt(searchParams.get('periodMonths') || '12');

    const now = new Date();
    const months: { month: string; total: number; new: number; expansion: number; contraction: number; churn: number }[] = [];

    for (let i = periodMonths - 1; i >= 0; i--) {
      const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);

      const newInMonth = await globalPrisma.tenant.count({
        where: {
          fechaCreacion: { gte: monthStart, lte: monthEnd },
          estado: { in: ['activo', 'trial'] }
        }
      });

      const tenants = await globalPrisma.tenant.findMany({
        where: {
          estado: { in: ['activo', 'trial'] },
          fechaCreacion: { lte: monthEnd }
        },
        select: { mrr: true, plan: true }
      });

      const total = tenants.reduce((sum, t) => sum + (t.mrr || 0), 0);

      const expansion = await globalPrisma.subscription.count({
        where: {
          fechaActualizacion: { gte: monthStart, lte: monthEnd },
          metadata: { path: ['upgrade'], equals: true }
        }
      });

      const contraction = await globalPrisma.subscription.count({
        where: {
          fechaActualizacion: { gte: monthStart, lte: monthEnd },
          metadata: { path: ['downgrade'], equals: true }
        }
      });

      const churnedInMonth = await globalPrisma.tenant.count({
        where: {
          estado: 'cancelado',
          fechaCancelacion: { gte: monthStart, lte: monthEnd }
        }
      });

      months.push({
        month: monthStart.toLocaleDateString('es-ES', { month: 'short' }),
        total,
        new: newInMonth * 100,
        expansion: expansion * 50,
        contraction: contraction * 30,
        churn: churnedInMonth * 80
      });
    }

    const currentMRR = await SaaSMetricsService.calculateMRR();
    const previousMonth = months[months.length - 2];
    const previousMRR = previousMonth?.total || currentMRR * 0.95;
    const growth = currentMRR > 0 ? ((currentMRR - previousMRR) / previousMRR) * 100 : 0;

    const summary = {
      currentMRR,
      previousMRR: Math.round(previousMRR),
      growth: Math.round(growth * 100) / 100,
      expansion: months.reduce((sum, m) => sum + m.expansion, 0),
      contraction: months.reduce((sum, m) => sum + m.contraction, 0),
      churn: months.reduce((sum, m) => sum + m.churn, 0),
      netNew: currentMRR - previousMRR
    };

    return NextResponse.json({ revenue: months, summary });
  } catch (error) {
    console.error('[SaaS Revenue] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch revenue data', details: (error as Error).message },
      { status: 500 }
    );
  }
}
