export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { seedTenantPipelines } from '@/lib/pipelines';

/**
 * POST /api/pipelines/seed
 * Manual seed of pipelines for the current tenant.
 * Creates any missing predefined pipelines based on enabled modules.
 * 
 * Body (optional):
 *   { modules?: string[] } — filter specific modules to seed (e.g. ['rrhh', 'proyectos'])
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || !(session.user as any).tenantId) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const tenantId = (session.user as any).tenantId;

    // Fetch tenant's enabled modules
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { enabledModules: true },
    });

    if (!tenant) {
      return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 });
    }

    let modulesToSeed = tenant.enabledModules || [];

    // Optionally filter by requested modules from body
    try {
      const body = await request.json();
      if (body.modules && Array.isArray(body.modules)) {
        // Only seed pipelines for the requested modules that the tenant actually has
        modulesToSeed = body.modules.filter((m: string) =>
          modulesToSeed.includes(m)
        );
      }
    } catch {
      // No body or invalid JSON — seed all modules
    }

    // Count active pipelines before seeding to compute delta
    const beforeCount = await prisma.pipeline.count({
      where: { tenantId, activo: true },
    });

    await seedTenantPipelines(tenantId, modulesToSeed);

    // Fetch all active pipelines after seeding
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

    const afterCount = pipelines.length;
    const newlyCreated = Math.max(0, afterCount - beforeCount);

    return NextResponse.json({
      message: newlyCreated > 0
        ? `Pipeline seed completado: ${newlyCreated} nuevo(s) pipeline(s) creado(s) (${pipelines.length} total)`
        : `Pipeline seed completado: todos los pipelines ya estaban presentes (${pipelines.length} total)`,
      pipelines,
      modulesSeeded: modulesToSeed,
      totalPipelines: pipelines.length,
      newlyCreated,
    });
  } catch (error: any) {
    console.error('❌ Error seeding pipelines:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
