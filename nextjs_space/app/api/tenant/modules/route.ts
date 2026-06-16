export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withTenantAuth } from '@/lib/api-key-auth';
import { getActiveModules, ALL_MODULES, type CrmModule } from '@/lib/plans';

const CORE_MODULES = ['leads', 'contactos', 'empresas', 'pipeline', 'tareas', 'analytics', 'equipo', 'configuracion', 'conocimiento'];

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
      select: { plan: true, enabledModules: true, accountType: true, moneda: true, subdomain: true, configuracion: true }
    });

    if (!tenant) {
      return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 });
    }

    const tenantFeatures = await prisma.tenantFeature.findMany({
      where: { tenantId },
      select: { feature: true, habilitado: true }
    });

    // 1. Obtener módulos según plan y overrides de TenantFeature
    const planModules = await getActiveModules(tenant.plan, tenantFeatures);
    
    // 2. Obtener módulos habilitados manualmente (normalizados)
    const manualModules = (tenant.enabledModules || []).map(m => m.toLowerCase());
    
    // 3. Unificar (Merge)
    const mergedModules = new Set([...planModules, ...manualModules]);

    // BYPASS: Módulos ilimitados para Admin y Demo
    if (tenant.subdomain === 'admin' || tenant.subdomain?.startsWith('demo')) {
      const { ALL_MODULES } = await import('@/lib/plans');
      ALL_MODULES.forEach(m => mergedModules.add(m.id));
    }

    // 4. Mapeo Legacy: Si tiene 'crm', asegurar módulos core
    if (mergedModules.has('crm') || mergedModules.has('CRM')) {
       ['leads', 'contactos', 'empresas', 'pipeline', 'tareas', 'analytics', 'mensajes', 'citas', 'catalogo'].forEach(m => mergedModules.add(m));
    }
    
    // 5. Mapeo Legacy: Si tiene 'ia_agencia', asegurar 'agency'
    if (mergedModules.has('ia_agencia')) {
       mergedModules.add('agency');
    }

    const finalModules = Array.from(mergedModules);

    // SEGURIDAD: Asegurar que módulos core de perfil siempre estén presentes
    if (!finalModules.includes('mi_tarjeta')) {
       finalModules.push('mi_tarjeta');
    }
    if (!finalModules.includes('configuracion')) {
       finalModules.push('configuracion');
    }

    const config = tenant.configuracion as Record<string, any> | null;
    const complianceMode = (config?.complianceMode as string) || 'normal';

    return NextResponse.json({ 
      modules: finalModules, 
      plan: tenant.plan,
      accountType: tenant.accountType,
      country: tenant.moneda === 'MXN' ? 'MX' : 'ES',
      complianceMode,
    });

  } catch (error) {
    console.error('[TenantModulesAPI] Error:', error);
    return NextResponse.json({ error: 'Error al obtener módulos del tenant' }, { status: 500 });
  }
});

/**
 * PATCH /api/tenant/modules
 * Activa o desactiva un módulo para el tenant actual.
 * Los módulos core no se pueden desactivar.
 */
export const PATCH = withTenantAuth(async (request, auth) => {
  try {
    const tenantId = auth.tenant!.id;
    const body = await request.json();
    const { moduleId, habilitado } = body;

    if (!moduleId || typeof habilitado !== 'boolean') {
      return NextResponse.json({ error: 'moduleId y habilitado (boolean) son requeridos' }, { status: 400 });
    }

    // Validar que el módulo existe
    const validIds = new Set(ALL_MODULES.map(m => m.id));
    if (!validIds.has(moduleId)) {
      return NextResponse.json({ error: `Módulo inválido: ${moduleId}` }, { status: 400 });
    }

    // Proteger módulos core
    if (!habilitado && CORE_MODULES.includes(moduleId)) {
      return NextResponse.json({ error: `El módulo ${moduleId} es esencial y no se puede desactivar` }, { status: 400 });
    }

    // Upsert del TenantFeature
    await prisma.tenantFeature.upsert({
      where: {
        tenantId_feature: { tenantId, feature: moduleId },
      },
      update: { habilitado },
      create: {
        tenantId,
        feature: moduleId,
        habilitado,
      },
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId: auth.user!.id,
        tenantId,
        accion: habilitado ? 'activar_modulo' : 'desactivar_modulo',
        entidad: 'tenant_feature',
        entidadId: tenantId,
        descripcion: `Módulo ${moduleId} ${habilitado ? 'activado' : 'desactivado'} por el tenant`,
      },
    });

    return NextResponse.json({ success: true, moduleId, habilitado });

  } catch (error) {
    console.error('[TenantModulesAPI] Error PATCH:', error);
    return NextResponse.json({ error: 'Error al actualizar módulo' }, { status: 500 });
  }
});
