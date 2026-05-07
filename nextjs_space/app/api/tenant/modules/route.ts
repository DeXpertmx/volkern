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
      select: { plan: true, enabledModules: true, accountType: true, moneda: true }
    });

    if (!tenant) {
      return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 });
    }

    const tenantFeatures = await prisma.tenantFeature.findMany({
      where: { tenantId },
      select: { feature: true, habilitado: true }
    });

    // Determinar módulos finales basados en plan, add-ons y habilitación manual
    let finalModules = tenant.enabledModules && tenant.enabledModules.length > 0
      ? tenant.enabledModules
      : await getActiveModules(tenant.plan, tenantFeatures);

    // SEGURIDAD: Asegurar que módulos core de perfil siempre estén presentes si el plan lo permite
    if (!finalModules.includes('mi_tarjeta')) {
       const planConfig = await getActiveModules(tenant.plan, tenantFeatures);
       if (planConfig.includes('mi_tarjeta')) {
         finalModules.push('mi_tarjeta');
       }
    }
    
    // Forzar configuración y perfil como básicos
    if (!finalModules.includes('configuracion')) finalModules.push('configuracion');

    return NextResponse.json({ 
      modules: finalModules, 
      plan: tenant.plan,
      accountType: tenant.accountType,
      country: tenant.moneda === 'MXN' ? 'MX' : 'ES'
    });

  } catch (error) {
    console.error('[TenantModulesAPI] Error:', error);
    return NextResponse.json({ error: 'Error al obtener módulos del tenant' }, { status: 500 });
  }
});
