export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { ComplianceGate } from '@/lib/compliance-gate';

/**
 * PATCH /api/pipelines/[id]
 * Update a pipeline (name, description, order, active status)
 */
export async function PATCH(
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
    const body = await request.json();
    const { nombre, descripcion, orden, activo, color, icono } = body;

    // Verify pipeline belongs to tenant
    const existing = await prisma.pipeline.findFirst({
      where: { id: pipelineId, tenantId },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Pipeline no encontrado' }, { status: 404 });
    }

    // Check for duplicate name if renaming
    if (nombre && nombre !== existing.nombre) {
      const duplicate = await prisma.pipeline.findUnique({
        where: {
          tenantId_nombre: { tenantId, nombre },
        },
      });
      if (duplicate) {
        return NextResponse.json(
          { error: 'Ya existe un pipeline con ese nombre' },
          { status: 409 }
        );
      }
    }

    const pipeline = await prisma.pipeline.update({
      where: { id: pipelineId },
      data: {
        ...(nombre !== undefined && { nombre }),
        ...(descripcion !== undefined && { descripcion }),
        ...(orden !== undefined && { orden }),
        ...(activo !== undefined && { activo }),
        ...(color !== undefined && { color }),
        ...(icono !== undefined && { icono }),
      },
    });

    return NextResponse.json({ pipeline });
  } catch (error: any) {
    console.error('❌ Error updating pipeline:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * DELETE /api/pipelines/[id]
 * Soft-delete a pipeline (set activo=false).
 * Accepts optional `migrateToPipelineId` in body to migrate active deals
 * to another pipeline before deleting.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true, tenantId: true },
    });

    if (!user?.tenantId) {
      return NextResponse.json({ error: 'Usuario sin tenant' }, { status: 403 });
    }

    const tenantId = user.tenantId;
    const pipelineId = params.id;

    // Read optional body for migration target
    let migrateToPipelineId: string | undefined
    try {
      const body = await request.json()
      migrateToPipelineId = body.migrateToPipelineId
    } catch {
      // No body — no migration requested
    }

    // Verify pipeline belongs to tenant
    const existing = await prisma.pipeline.findFirst({
      where: { id: pipelineId, tenantId },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Pipeline no encontrado' }, { status: 404 });
    }

    // Check if there are deals in this pipeline
    const dealCount = await prisma.deal.count({
      where: { pipelineId, estado: 'activo' },
    });

    // ── Compliance Gate: pipeline_delete requiere justificación ──────────
    const gateResult = await ComplianceGate.check({
      tenantId,
      userId: user.id,
      action: 'pipeline_delete',
      entityId: pipelineId,
      entityType: 'pipeline',
      metadata: {
        justification: migrateToPipelineId
          ? `Eliminación de pipeline "${existing.nombre}" con migración de ${dealCount} deals al pipeline ${migrateToPipelineId}`
          : undefined,
        dealsActivos: dealCount,
        migrateToPipelineId: migrateToPipelineId || undefined,
      },
    });

    if (!gateResult.allowed) {
      return NextResponse.json({
        error: gateResult.reason,
        gate: {
          requiredAction: gateResult.requiredAction,
          missingRequirements: gateResult.missingRequirements,
          blockingRule: gateResult.blockingRule?.name,
          mode: gateResult.mode,
        },
      }, { status: 403 });
    }

    if (dealCount > 0) {
      if (migrateToPipelineId) {
        // Verify target pipeline exists and belongs to tenant
        const targetPipeline = await prisma.pipeline.findFirst({
          where: { id: migrateToPipelineId, tenantId, activo: true },
        });

        if (!targetPipeline) {
          return NextResponse.json(
            { error: 'Pipeline destino no encontrado o no activo' },
            { status: 400 }
          );
        }

        if (targetPipeline.id === pipelineId) {
          return NextResponse.json(
            { error: 'No puedes migrar deals al mismo pipeline' },
            { status: 400 }
          );
        }

        // Migrate deals to target pipeline
        await prisma.deal.updateMany({
          where: { pipelineId, estado: 'activo' },
          data: { pipelineId: migrateToPipelineId },
        });
      } else {
        return NextResponse.json(
          { error: `No se puede eliminar: ${dealCount} deals activos en este pipeline` },
          { status: 409 }
        );
      }
    }

    // Soft delete the pipeline
    await prisma.pipeline.update({
      where: { id: pipelineId },
      data: { activo: false },
    });

    // Also soft delete stages
    await prisma.pipelineStage.updateMany({
      where: { pipelineId },
      data: { activo: false },
    });

    const migratedMsg = migrateToPipelineId ? `${dealCount} deals migrados y ` : '';
    return NextResponse.json({ success: true, message: `${migratedMsg}pipeline eliminado` });
  } catch (error: any) {
    console.error('❌ Error deleting pipeline:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
