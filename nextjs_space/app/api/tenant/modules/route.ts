export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withTenantAuth } from '@/lib/api-key-auth';
import { getActiveModules } from '@/lib/plans';

/**
 * GET /api/tenant/modules
 * Devuelve la lista de módulos activos para el tenant actual.
 * Refactorizado con withTenantAuth para soportar aislamiento multi-db e impersonación.
 */
export const GET = withTenantAuth(async (request, auth) => {
  try {
    const tenantId = auth.tenant!.id;

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { plan: true, enabledModules: true, accountType: true, pais: true }
    });

    if (!tenant) {
      return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 });
    }

    const tenantFeatures = await prisma.tenantFeature.findMany({
      where: { tenantId },
      select: { feature: true, habilitado: true }
    });

    // Determinar módulos finales basados en plan, add-ons y habilitación manual
    const finalModules = tenant.enabledModules && tenant.enabledModules.length > 0
      ? tenant.enabledModules
      : await getActiveModules(tenant.plan, tenantFeatures);

    return NextResponse.json({ 
      modules: finalModules, 
      plan: tenant.plan,
      accountType: tenant.accountType,
      country: tenant.pais || 'ES'
    });

  } catch (error) {
    console.error('[TenantModulesAPI] Error:', error);
    return NextResponse.json({ error: 'Error al obtener módulos del tenant' }, { status: 500 });
  }
});
