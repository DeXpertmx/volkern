import { NextResponse } from 'next/server';
import { globalPrisma } from '@/lib/db';
import { getPlanConfig } from '@/lib/subscription';

export async function GET() {
  try {
    const tenants = await globalPrisma.tenant.findMany({
      where: { estado: { in: ['activo', 'trial'] } },
      select: { plan: true, mrr: true }
    });

    const planRevenue: Record<string, { mrr: number; customers: number }> = {};

    for (const tenant of tenants) {
      const planSlug = tenant.plan || 'starter';
      const planConfig = await getPlanConfig(planSlug);
      const mrr = tenant.mrr || planConfig?.precio || 0;

      if (!planRevenue[planSlug]) {
        planRevenue[planSlug] = { mrr: 0, customers: 0 };
      }
      planRevenue[planSlug].mrr += mrr;
      planRevenue[planSlug].customers += 1;
    }

    const totalMRR = Object.values(planRevenue).reduce((sum, p) => sum + p.mrr, 0);
    const plans = Object.entries(planRevenue).map(([plan, data]) => ({
      plan,
      mrr: data.mrr,
      customers: data.customers,
      percentage: totalMRR > 0 ? (data.mrr / totalMRR) * 100 : 0
    })).sort((a, b) => b.mrr - a.mrr);

    return NextResponse.json({ plans });
  } catch (error) {
    console.error('[SaaS Revenue By Plan] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch revenue by plan', details: (error as Error).message },
      { status: 500 }
    );
  }
}
