import { NextRequest, NextResponse } from 'next/server';
import { globalPrisma } from '@/lib/db';

export const dynamic = 'force-dynamic';
import { isSuperadminRequest } from '@/lib/auth-helpers';
import { getPlanConfig } from '@/lib/subscription';

export async function GET() {
  // Solo operadores Superadmin de la plataforma
  const auth = await isSuperadminRequest();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error || 'No autorizado' }, { status: 403 });
  }

  try {
    const tenants = await globalPrisma.tenant.findMany({
      where: { estado: { in: ['activo', 'trial'] } },
      include: {
        subscriptions: {
          where: { estado: { in: ['activa', 'trial'] } },
          include: { plan: true }
        }
      }
    });

    const planCounts: Record<string, { customers: number; revenue: number }> = {};

    for (const tenant of tenants) {
      const planSlug = tenant.plan || tenant.subscriptions?.[0]?.plan?.slug || 'esencial';
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
