export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { withTenantAuth } from '@/lib/api-key-auth'
import { seedTenantPipelines } from '@/lib/pipelines'

// GET - Obtener etapas del pipeline
export const GET = withTenantAuth(async (req, auth) => {
  try {
    const tenantId = auth.tenant!.id;
    const user = auth.user!;

    // Soporte para filtrar por pipelineId
    const { searchParams } = new URL(req.url)
    const pipelineId = searchParams.get('pipelineId')

    // Auto-seed pipelines if none exist
    const pipelinesExist = await prisma.pipeline.findFirst({
      where: { tenantId, activo: true },
    })

    if (!pipelinesExist) {
      const tenant = await prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { enabledModules: true },
      })
      if (tenant) {
        await seedTenantPipelines(tenantId, tenant.enabledModules)
      }
    }

    const where: any = {
      tenantId: tenantId,
      activo: true,
    }

    if (pipelineId) {
      where.pipelineId = pipelineId
    }

    let stages = await prisma.pipelineStage.findMany({
      where,
      orderBy: {
        orden: 'asc',
      },
    })

    // If still no stages and no specific pipeline, create default
    if (stages.length === 0 && !pipelineId) {
      const firstPipeline = await prisma.pipeline.findFirst({
        where: { tenantId, activo: true },
        orderBy: { orden: 'asc' },
      })

      if (firstPipeline) {
        stages = await prisma.pipelineStage.findMany({
          where: {
            tenantId,
            pipelineId: firstPipeline.id,
            activo: true,
          },
          orderBy: { orden: 'asc' },
        })
      }
    }

    return NextResponse.json({ stages })
  } catch (error: any) {
    console.error('Error al obtener etapas:', error)
    return NextResponse.json(
      { error: 'Error al obtener etapas', details: error.message },
      { status: 500 }
    )
  }
}, ['leads:read', 'deals:read'])

// POST - Crear etapa personalizada
export const POST = withTenantAuth(async (req, auth) => {
  try {
    const tenantId = auth.tenant!.id;
    const user = auth.user!;

    const body = await req.json()
    const {
      nombre,
      descripcion,
      probabilidad = 50,
      color = '#3b82f6',
      requiereAprobacion = false,
      pipelineId,
    } = body

    if (!nombre) {
      return NextResponse.json({ error: 'Nombre requerido' }, { status: 400 })
    }

    // Obtener el último orden dentro del pipeline (o global si no hay pipelineId)
    const ultimaEtapa = await prisma.pipelineStage.findFirst({
      where: {
        tenantId: tenantId,
        ...(pipelineId ? { pipelineId } : {}),
      },
      orderBy: { orden: 'desc' },
    })

    const orden = (ultimaEtapa?.orden || 0) + 1

    const stage = await prisma.pipelineStage.create({
      data: {
        tenantId: tenantId,
        nombre,
        descripcion,
        orden,
        probabilidad: parseInt(probabilidad),
        color,
        requiereAprobacion,
        ...(pipelineId ? { pipelineId } : {}),
      },
    })

    return NextResponse.json({ stage }, { status: 201 })
  } catch (error: any) {
    console.error('Error al crear etapa:', error)
    return NextResponse.json(
      { error: 'Error al crear etapa', details: error.message },
      { status: 500 }
    )
  }
}, ['leads:write', 'configuracion:editar'])

// PATCH - Actualizar etapa existente (con pipelineId)
export const PATCH = withTenantAuth(async (req, auth) => {
  try {
    const tenantId = auth.tenant!.id;
    const body = await req.json()
    const { id, nombre, descripcion, orden, probabilidad, color, pipelineId, activo } = body

    if (!id) {
      return NextResponse.json({ error: 'ID requerido' }, { status: 400 })
    }

    const data: any = {}
    if (nombre !== undefined) data.nombre = nombre
    if (descripcion !== undefined) data.descripcion = descripcion
    if (orden !== undefined) data.orden = orden
    if (probabilidad !== undefined) data.probabilidad = parseInt(probabilidad)
    if (color !== undefined) data.color = color
    if (pipelineId !== undefined) data.pipelineId = pipelineId
    if (activo !== undefined) data.activo = activo

    const stage = await prisma.pipelineStage.update({
      where: { id },
      data,
    })

    return NextResponse.json({ stage })
  } catch (error: any) {
    console.error('Error al actualizar etapa:', error)
    return NextResponse.json(
      { error: 'Error al actualizar etapa', details: error.message },
      { status: 500 }
    )
  }
}, ['leads:write', 'configuracion:editar'])
