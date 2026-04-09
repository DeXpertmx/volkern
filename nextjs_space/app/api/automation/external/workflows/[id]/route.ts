export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { withTenantAuth } from '@/lib/api-key-auth'
import { automationService } from '@/lib/automation-service'

export const GET = withTenantAuth(async (req, auth, params) => {
  try {
    const tenantId = auth.tenant!.id

    const workflow = await prisma.n8nWorkflow.findFirst({
      where: {
        id: params.id,
        tenantId,
      },
    })

    if (!workflow) {
      return NextResponse.json({ error: 'Workflow no encontrado' }, { status: 404 })
    }

    return NextResponse.json({
      success: true,
      workflow,
    })
  } catch (error: any) {
    console.error('[API] Error getting workflow:', error)
    return NextResponse.json(
      { error: error.message || 'Error obteniendo workflow' },
      { status: 500 }
    )
  }
}, ['automations:read'])

export const PATCH = withTenantAuth(async (req, auth, params) => {
  try {
    const tenantId = auth.tenant!.id
    const user = auth.user!

    const workflow = await prisma.n8nWorkflow.findFirst({
      where: {
        id: params.id,
        tenantId,
      },
    })

    if (!workflow) {
      return NextResponse.json({ error: 'Workflow no encontrado' }, { status: 404 })
    }

    const body = await req.json()
    const { nombre, descripcion, trigger, configPayload, webhookUrl, activo } = body

    if (activo !== undefined && activo !== workflow.activo) {
      await automationService.toggleWorkflow(params.id, tenantId, activo)
    }

    const updated = await prisma.n8nWorkflow.update({
      where: { id: params.id },
      data: {
        ...(nombre !== undefined && { nombre }),
        ...(descripcion !== undefined && { descripcion }),
        ...(trigger !== undefined && { trigger }),
        ...(configPayload !== undefined && { configPayload }),
        ...(webhookUrl !== undefined && { webhookUrl }),
        ...(activo !== undefined && { activo }),
        updatedAt: new Date(),
      },
    })

    await prisma.auditLog.create({
      data: {
        tenantId,
        userId: user.id,
        accion: 'update_n8n_workflow',
        entidad: 'N8nWorkflow',
        entidadId: params.id,
        descripcion: `Workflow actualizado: ${updated.nombre}`,
        cambiosDespues: body,
      },
    })

    return NextResponse.json({
      success: true,
      workflow: updated,
    })
  } catch (error: any) {
    console.error('[API] Error updating workflow:', error)
    return NextResponse.json(
      { error: error.message || 'Error actualizando workflow' },
      { status: 500 }
    )
  }
}, ['automations:write'])

export const DELETE = withTenantAuth(async (req, auth, params) => {
  try {
    const tenantId = auth.tenant!.id
    const user = auth.user!

    const workflow = await prisma.n8nWorkflow.findFirst({
      where: {
        id: params.id,
        tenantId,
      },
    })

    if (!workflow) {
      return NextResponse.json({ error: 'Workflow no encontrado' }, { status: 404 })
    }

    await prisma.n8nWorkflow.delete({
      where: { id: params.id },
    })

    await prisma.auditLog.create({
      data: {
        tenantId,
        userId: user.id,
        accion: 'delete_n8n_workflow',
        entidad: 'N8nWorkflow',
        entidadId: params.id,
        descripcion: `Workflow eliminado: ${workflow.nombre}`,
        cambiosAntes: { n8nWorkflowId: workflow.n8nWorkflowId, nombre: workflow.nombre },
      },
    })

    return NextResponse.json({
      success: true,
      message: 'Workflow eliminado de Volkern',
    })
  } catch (error: any) {
    console.error('[API] Error deleting workflow:', error)
    return NextResponse.json(
      { error: error.message || 'Error eliminando workflow' },
      { status: 500 }
    )
  }
}, ['automations:write'])
