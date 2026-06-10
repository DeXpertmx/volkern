export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getMaxPipelines } from '@/lib/pipelines-server';

/**
 * POST /api/pipelines/[id]/duplicate
 * Clone a pipeline (including its stages) with a new name.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || !(session.user as any).tenantId) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const tenantId = (session.user as any).tenantId;
    const pipelineId = params.id;

    // Find source pipeline
    const source = await prisma.pipeline.findFirst({
      where: { id: pipelineId, tenantId, activo: true },
      include: {
        stages: {
          where: { activo: true },
          orderBy: { orden: 'asc' },
        },
      },
    });

    if (!source) {
      return NextResponse.json({ error: 'Pipeline no encontrado' }, { status: 404 });
    }

    // Check limit
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { plan: true },
    });

    const maxPipelines = await getMaxPipelines(tenantId, tenant?.plan || 'starter');
    const existingCount = await prisma.pipeline.count({
      where: { tenantId, activo: true },
    });

    if (existingCount >= maxPipelines) {
      return NextResponse.json(
        { error: `Límite de pipelines alcanzado (${maxPipelines})` },
        { status: 403 }
      );
    }

    // Generate a unique name: "Original (copia)" or "Original (copia 2)"
    let newName = `${source.nombre} (copia)`;
    let suffix = 2;
    while (await prisma.pipeline.findUnique({
      where: { tenantId_nombre: { tenantId, nombre: newName } },
    })) {
      newName = `${source.nombre} (copia ${suffix})`;
      suffix++;
    }

    // Get next order
    const last = await prisma.pipeline.findFirst({
      where: { tenantId },
      orderBy: { orden: 'desc' },
      select: { orden: true },
    });

    // Create new pipeline with source settings
    const duplicate = await prisma.pipeline.create({
      data: {
        tenantId,
        nombre: newName,
        categoria: source.categoria,
        descripcion: source.descripcion,
        color: source.color,
        icono: source.icono,
        orden: (last?.orden || 0) + 1,
      },
    });

    // Clone stages
    if (source.stages.length > 0) {
      await prisma.pipelineStage.createMany({
        data: source.stages.map((stage) => ({
          tenantId,
          pipelineId: duplicate.id,
          nombre: stage.nombre,
          descripcion: stage.descripcion,
          orden: stage.orden,
          probabilidad: stage.probabilidad,
          color: stage.color,
          requiereAprobacion: stage.requiereAprobacion,
          esEtapaFinal: stage.esEtapaFinal,
          tipoEtapaFinal: stage.tipoEtapaFinal,
          categoria: stage.categoria,
          activo: true,
        })),
      });
    }

    return NextResponse.json({ pipeline: duplicate }, { status: 201 });
  } catch (error: any) {
    console.error('❌ Error duplicating pipeline:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
