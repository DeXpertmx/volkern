export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getPlanConfig, ALL_MODULES, ADDONS, type CrmModule } from '@/lib/plans';

// GET - Obtener módulos del tenant con estado actual
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      include: { role: true }
    });

    if (user?.role?.nombre !== 'Superadmin') {
      return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 });
    }

    const tenant = await prisma.tenant.findUnique({
      where: { id: params.id },
      select: { id: true, nombre: true, plan: true }
    });

    if (!tenant) {
      return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 });
    }

    const tenantFeatures = await prisma.tenantFeature.findMany({
      where: { tenantId: params.id }
    });

    const planConfig = await getPlanConfig(tenant.plan);
    const planModules = planConfig.modules;

    // Construir estado de cada módulo
    const modules = ALL_MODULES.map(mod => {
      const isInPlan = planModules.includes(mod.id);
      const override = tenantFeatures.find(tf => tf.feature === mod.id);

      let status: 'plan' | 'addon' | 'override_on' | 'override_off' | 'disabled';
      let active: boolean;

      if (override) {
        if (override.habilitado) {
          status = isInPlan ? 'plan' : 'override_on';
          active = true;
        } else {
          status = 'override_off';
          active = false;
        }
      } else {
        status = isInPlan ? 'plan' : 'disabled';
        active = isInPlan;
      }

      return {
        ...mod,
        active,
        status,
        isInPlan,
        overrideId: override?.id || null,
        razon: override?.razon || null,
      };
    });

    return NextResponse.json({
      tenantId: tenant.id,
      tenantName: tenant.nombre,
      plan: tenant.plan,
      modules,
      addons: ADDONS,
    });

  } catch (error) {
    console.error('Error fetching tenant modules:', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}

// PATCH - Activar/desactivar módulos para un tenant
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      include: { role: true }
    });

    if (user?.role?.nombre !== 'Superadmin') {
      return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 });
    }

    const body = await req.json();
    const { moduleId, habilitado, razon } = body;

    if (!moduleId || typeof habilitado !== 'boolean') {
      return NextResponse.json({ error: 'moduleId y habilitado requeridos' }, { status: 400 });
    }

    const tenant = await prisma.tenant.findUnique({
      where: { id: params.id },
      select: { plan: true }
    });

    if (!tenant) {
      return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 });
    }

    const planConfig = await getPlanConfig(tenant.plan);
    const planModules = planConfig.modules;
    const isInPlan = planModules.includes(moduleId as CrmModule);

    // Si el módulo está en el plan y se quiere activar, eliminar el override
    if (isInPlan && habilitado) {
      await prisma.tenantFeature.deleteMany({
        where: { tenantId: params.id, feature: moduleId }
      });
      return NextResponse.json({ success: true, action: 'restored_to_plan' });
    }

    // Upsert el override
    await prisma.tenantFeature.upsert({
      where: {
        tenantId_feature: {
          tenantId: params.id,
          feature: moduleId,
        }
      },
      update: {
        habilitado,
        razon: razon || (habilitado ? 'Activado por admin' : 'Desactivado por admin'),
        habilitadoPor: session.user.id,
      },
      create: {
        tenantId: params.id,
        feature: moduleId,
        habilitado,
        razon: razon || (habilitado ? 'Activado por admin' : 'Desactivado por admin'),
        habilitadoPor: session.user.id,
      }
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        accion: habilitado ? 'activar_modulo' : 'desactivar_modulo',
        entidad: 'tenant_feature',
        entidadId: params.id,
        descripcion: `Módulo ${moduleId} ${habilitado ? 'activado' : 'desactivado'} para tenant ${params.id}`,
      }
    });

    return NextResponse.json({ success: true, action: habilitado ? 'enabled' : 'disabled' });

  } catch (error) {
    console.error('Error updating tenant module:', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}

// PUT - Asignar un plan completo (activa los módulos del plan)
export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      include: { role: true }
    });

    if (user?.role?.nombre !== 'Superadmin') {
      return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 });
    }

    const { plan } = await req.json();

    // Obtener configuración del nuevo plan
    const planConfig = await getPlanConfig(plan);
    if (!planConfig) {
      return NextResponse.json({ error: 'Plan inválido o no encontrado' }, { status: 400 });
    }

    // Actualizar plan del tenant
    await prisma.tenant.update({
      where: { id: params.id },
      data: { 
        plan,
        limites: planConfig.limites as any
      }
    });

    // Limpiar overrides que ya no aplican (módulos que ahora están en el plan)
    const newPlanModules = planConfig.modules;
    await prisma.tenantFeature.deleteMany({
      where: {
        tenantId: params.id,
        feature: { in: newPlanModules },
        habilitado: true,  // Solo borrar activaciones redundantes
      }
    });

    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        accion: 'cambiar_plan',
        entidad: 'tenant',
        entidadId: params.id,
        descripcion: `Plan cambiado a ${plan}`,
      }
    });

    return NextResponse.json({ success: true, plan });

  } catch (error) {
    console.error('Error updating tenant plan:', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
