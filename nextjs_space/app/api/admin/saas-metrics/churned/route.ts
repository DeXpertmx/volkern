import { NextRequest, NextResponse } from 'next/server';
import { globalPrisma } from '@/lib/db';

export const dynamic = 'force-dynamic';
import { isSuperadminRequest } from '@/lib/auth-helpers';
import { getPlanConfig } from '@/lib/subscription';

export async function GET(request: NextRequest) {
  // Solo operadores Superadmin de la plataforma
  const auth = await isSuperadminRequest();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error || 'No autorizado' }, { status: 403 });
  }

  try {
    const searchParams = request.nextUrl.searchParams;
    const periodDays = parseInt(searchParams.get('periodDays') || '90');
    
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - periodDays);

    // Misma definición que el resto de la plataforma: la baja se fecha en
    // `Tenant.fechaBaja` (ver calcularVentanaChurn), no en la suscripción.
    const churnedTenants = await globalPrisma.tenant.findMany({
      where: { fechaBaja: { gte: startDate } },
      include: {
        subscriptions: {
          where: { estado: 'cancelada' },
          orderBy: { fechaCancelacion: 'desc' },
          take: 1,
          include: { plan: true }
        }
      },
      orderBy: { fechaBaja: 'desc' }
    });

    const customers = await Promise.all(
      churnedTenants.map(async (tenant) => {
        const sub = tenant.subscriptions?.[0];
        const planSlug = tenant.plan || sub?.plan?.slug || 'esencial';
        const planConfig = await getPlanConfig(planSlug);
        const createdAt = new Date(tenant.fechaCreacion);
        const cancelledAt = tenant.fechaBaja ? new Date(tenant.fechaBaja) : new Date();
        const mesesActivo = Math.max(1, Math.round((cancelledAt.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24 * 30)));

        return {
          id: tenant.id,
          nombre: tenant.nombre,
          plan: planSlug,
          mrr: tenant.mrr || planConfig?.precio || 0,
          fechaCancelacion: tenant.fechaBaja,
          reason: (sub?.metadata as any)?.churnReason || null,
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