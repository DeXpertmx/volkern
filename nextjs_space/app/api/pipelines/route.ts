export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getMaxPipelines, seedTenantPipelines } from '@/lib/pipelines-server'
import { getCrmEntitlements } from '@/lib/crm-entitlements';

/**
 * GET /api/pipelines
 * List all pipelines for the current tenant
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || !(session.user as any).tenantId) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const tenantId = (session.user as any).tenantId;

    // Auto-seed pipelines if none exist for this tenant
    const existingCount = await prisma.pipeline.count({
      where: { tenantId, activo: true },
    });

    if (existingCount === 0) {
      const tenant = await prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { enabledModules: true },
      });
      if (tenant) {
        await seedTenantPipelines(tenantId, tenant.enabledModules || []);
      }
    }

    const pipelines = await prisma.pipeline.findMany({
      where: {
        tenantId,
        activo: true,
      },
      include: {
        _count: {
          select: {
            stages: true,
            deals: true,
          },
        },
      },
      orderBy: { orden: 'asc' },
    });

    // Get max pipelines info
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { plan: true },
    });

    const ent = await getCrmEntitlements(tenantId);
    const maxPipelines = Math.min(
      await getMaxPipelines(tenantId, tenant?.plan || 'esencial'),
      ent.limits.maxPipelines,
    );

    return NextResponse.json({
      pipelines,
      maxPipelines,
      canCreate: pipelines.length < maxPipelines,
    });
  } catch (error: any) {
    console.error('❌ Error listing pipelines:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * POST /api/pipelines
 * Create a new pipeline (with limit check)
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || !(session.user as any).tenantId) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const tenantId = (session.user as any).tenantId;
    const body = await request.json();
    const { nombre, categoria, descripcion } = body;

    if (!nombre) {
      return NextResponse.json({ error: 'Nombre requerido' }, { status: 400 });
    }

    // Check limit
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { plan: true },
    });

    const ent = await getCrmEntitlements(tenantId);
    const maxPipelines = Math.min(
      await getMaxPipelines(tenantId, tenant?.plan || 'esencial'),
      ent.limits.maxPipelines,
    );
    const existingCount = await prisma.pipeline.count({
      where: { tenantId, activo: true },
    });

    if (existingCount >= maxPipelines) {
      return NextResponse.json(
        {
          error: `Tu plan ${ent.tierName} permite ${maxPipelines} ${maxPipelines === 1 ? 'embudo' : 'embudos'}. Sube de nivel para crear más.`,
        },
        { status: 403 },
      );
    }

    // Check for duplicate name
    const existing = await prisma.pipeline.findUnique({
      where: {
        tenantId_nombre: { tenantId, nombre },
      },
    });

    if (existing) {
      return NextResponse.json(
        { error: 'Ya existe un pipeline con ese nombre' },
        { status: 409 }
      );
    }

    // Get next order
    const last = await prisma.pipeline.findFirst({
      where: { tenantId },
      orderBy: { orden: 'desc' },
      select: { orden: true },
    });

    const pipeline = await prisma.pipeline.create({
      data: {
        tenantId,
        nombre,
        categoria: categoria || 'custom',
        descripcion: descripcion || null,
        orden: (last?.orden || 0) + 1,
      },
    });

    // Create default stages
    const { DEFAULT_STAGES } = await import('@/lib/pipelines');
    for (const stage of DEFAULT_STAGES) {
      await prisma.pipelineStage.create({
        data: {
          tenantId,
          pipelineId: pipeline.id,
          nombre: stage.nombre,
          probabilidad: stage.probabilidad,
          orden: stage.orden,
          color: stage.color,
          esEtapaFinal: stage.esEtapaFinal,
          tipoEtapaFinal: stage.tipoEtapaFinal,
        },
      });
    }

    return NextResponse.json({ pipeline }, { status: 201 });
  } catch (error: any) {
    console.error('❌ Error creating pipeline:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
