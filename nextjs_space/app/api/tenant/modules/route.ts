export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getActiveModules, type CrmModule } from '@/lib/plans';

/**
 * GET /api/tenant/modules
 * Returns the list of active modules for the current tenant.
 * Used by the sidebar and other UI components to show/hide features.
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || !(session.user as any).tenantId) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const tenantId = (session.user as any).tenantId;

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { plan: true, enabledModules: true, accountType: true }
    });

    if (!tenant) {
      return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 });
    }

    const tenantFeatures = await prisma.tenantFeature.findMany({
      where: { tenantId },
      select: { feature: true, habilitado: true }
    });

    // Si el tenant tiene modulos específicos habilitados (Modelo Agency), usamos esos.
    // Si no, caemos en el comportamiento estándar basado en plan + add-ons.
    const finalModules = tenant.enabledModules && tenant.enabledModules.length > 0
      ? tenant.enabledModules
      : await getActiveModules(tenant.plan, tenantFeatures);

    return NextResponse.json({ 
      modules: finalModules, 
      plan: tenant.plan,
      accountType: tenant.accountType 
    });

  } catch (error) {
    console.error('Error fetching tenant modules:', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
