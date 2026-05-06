import { NextRequest, NextResponse } from 'next/server';
import { globalPrisma } from '@/lib/db';

export const dynamic = 'force-dynamic';
import { getPlanConfig } from '@/lib/subscription';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const periodDays = parseInt(searchParams.get('periodDays') || '90');
    
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - periodDays);

    const churnedTenants = await globalPrisma.tenant.findMany({
      where: {
        estado: 'cancelado',
        fechaCancelacion: { gte: startDate }
      },
      include: {
        subscription: {
          where: { estado: 'cancelada' },
          orderBy: { fechaCancelacion: 'desc' },
          take: 1
        }
      },
      orderBy: { fechaCancelacion: 'desc' }
    });

    const customers = await Promise.all(
      churnedTenants.map(async (tenant) => {
        const planSlug = tenant.plan || tenant.subscription?.[0]?.plan?.slug || 'starter';
        const planConfig = await getPlanConfig(planSlug);
        const createdAt = new Date(tenant.fechaCreacion);
        const cancelledAt = tenant.fechaCancelacion ? new Date(tenant.fechaCancelacion) : new Date();
        const mesesActivo = Math.max(1, Math.round((cancelledAt.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24 * 30)));

        return {
          id: tenant.id,
          nombre: tenant.nombre,
          plan: planSlug,
          mrr: tenant.mrr || planConfig?.precio || 0,
          fechaCancelacion: tenant.fechaCancelacion,
          reason: (tenant.subscription?.[0]?.metadata as any)?.churnReason || null,
          mesesActivo
        };
      })
    );

    return NextResponse.json({ customers, total: customers.length });
  } catch (error) {
    console.error('[SaaS Churned] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch churned customers', details: (error as Error).message },
      { status: 500 }
    );
  }
}