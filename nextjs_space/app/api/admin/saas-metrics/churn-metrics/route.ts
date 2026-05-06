import { NextRequest, NextResponse } from 'next/server';
import { globalPrisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const periodDays = parseInt(searchParams.get('periodDays') || '90');

    const now = new Date();
    const months: { month: string; churnRate: number; churned: number; total: number }[] = [];

    for (let i = Math.floor(periodDays / 30); i >= 0; i--) {
      const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);
      const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - i - 1, 1);
      const prevMonthEnd = new Date(now.getFullYear(), now.getMonth() - i, 0);

      const totalAtStart = await globalPrisma.tenant.count({
        where: {
          fechaCreacion: { lt: monthStart },
          estado: { in: ['activo', 'trial'] }
        }
      });

      const churnedInMonth = await globalPrisma.tenant.count({
        where: {
          estado: 'cancelado',
          fechaCancelacion: { gte: monthStart, lte: monthEnd }
        }
      });

      const churnRate = totalAtStart > 0 ? (churnedInMonth / totalAtStart) * 100 : 0;

      months.push({
        month: monthStart.toLocaleDateString('es-ES', { month: 'short', year: '2-digit' }),
        churnRate: Math.round(churnRate * 100) / 100,
        churned: churnedInMonth,
        total: totalAtStart
      });
    }

    const avgChurnRate = months.length > 0
      ? months.reduce((sum, m) => sum + m.churnRate, 0) / months.length
      : 0;

    return NextResponse.json({ metrics: months, avgChurnRate: Math.round(avgChurnRate * 100) / 100 });
  } catch (error) {
    console.error('[SaaS Churn Metrics] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch churn metrics', details: (error as Error).message },
      { status: 500 }
    );
  }
}