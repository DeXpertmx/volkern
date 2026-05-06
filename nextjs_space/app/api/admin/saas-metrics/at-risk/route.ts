import { NextRequest, NextResponse } from 'next/server';
import { globalPrisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const now = new Date();
    const fourteenDaysFromNow = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const failedPaymentTenants = await globalPrisma.tenant.findMany({
      where: {
        estado: { in: ['activo', 'trial'] },
        subscription: {
          some: {
            estado: 'fallida',
            fechaActualizacion: { gte: thirtyDaysAgo }
          }
        }
      },
      select: {
        id: true,
        nombre: true,
        plan: true,
        mrr: true,
        estado: true,
        fechaFin: true,
        updatedAt: true
      }
    });

    const expiringTenants = await globalPrisma.tenant.findMany({
      where: {
        estado: { in: ['activo', 'trial'] },
        fechaFin: { lte: fourteenDaysFromNow, gte: now }
      },
      select: {
        id: true,
        nombre: true,
        plan: true,
        mrr: true,
        estado: true,
        fechaFin: true,
        updatedAt: true
      }
    });

    const lowActivityTenants = await globalPrisma.tenant.findMany({
      where: {
        estado: 'activo',
        updatedAt: { lt: thirtyDaysAgo }
      },
      select: {
        id: true,
        nombre: true,
        plan: true,
        mrr: true,
        estado: true,
        fechaFin: true,
        updatedAt: true
      }
    });

    const addRisk = (tenants: any[], risk: 'failed_payment' | 'expiring_soon' | 'low_activity') => {
      return tenants.map(t => ({
        id: t.id,
        nombre: t.nombre,
        plan: t.plan || 'starter',
        mrr: t.mrr || 0,
        estado: t.estado,
        fechaFin: t.fechaFin,
        lastActivity: t.updatedAt,
        risk
      }));
    };

    const atRiskTenants = [
      ...addRisk(failedPaymentTenants, 'failed_payment'),
      ...addRisk(expiringTenants, 'expiring_soon'),
      ...addRisk(lowActivityTenants, 'low_activity')
    ].slice(0, 10);

    return NextResponse.json({ tenants: atRiskTenants });
  } catch (error) {
    console.error('[SaaS At-Risk] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch at-risk tenants', details: (error as Error).message },
      { status: 500 }
    );
  }
}