import { NextRequest, NextResponse } from 'next/server';
import { globalPrisma } from '@/lib/db';

export const dynamic = 'force-dynamic';
import { getPlanConfig } from '@/lib/subscription';

export async function GET() {
  try {
    const tenants = await globalPrisma.tenant.findMany({
      where: { estado: { in: ['activo', 'trial'] } },
      include: {
        subscription: {
          where: { estado: { in: ['activa', 'trial'] } },
          include: { plan: true }
        }
      }
    });

    const planCounts: Record<string, { customers: number; revenue: number }> = {};

    for (const tenant of tenants) {
      const planSlug = tenant.plan || tenant.subscription?.[0]?.plan?.slug || 'starter';
      const planConfig = await getPlanConfig(planSlug);
      const mrr = tenant.mrr || planConfig?.precio || 0;

      if (!planCounts[planSlug]) {
        planCounts[planSlug] = { customers: 0, revenue: 0 };
      }
      planCounts[planSlug].customers += 1;
      planCounts[planSlug].revenue += mrr;
    }

    const plans = Object.entries(planCounts).map(([name, data]) => ({
      name: name.charAt(0).toUpperCase() + name.slice(1),
      customers: data.customers,
      revenue: data.revenue
    }));

    return NextResponse.json({ plans });
  } catch (error) {
    console.error('[SaaS Distribution] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch distribution', details: (error as Error).message },
      { status: 500 }
    );
  }
}
