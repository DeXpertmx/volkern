export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { automationService } from '@/lib/automation-service'
import { prisma } from '@/lib/db'

/**
 * GET /api/automation/external/workflows/[id]
 * Obtiene detalles de un workflow
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email! },
      include: { tenant: true },
    })

    if (!user?.tenantId) {
      return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })
    }

    const workflow = await prisma.n8nWorkflow.findFirst({
      where: {
        id: params.id,
        tenantId: user.tenantId,
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
}

/**
 * PATCH /api/automation/external/workflows/[id]
 * Actualiza configuración de un workflow
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email! },
      include: { tenant: true },
    })

    if (!user?.tenantId) {
      return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })
    }

    const workflow = await prisma.n8nWorkflow.findFirst({
      where: {
        id: params.id,
        tenantId: user.tenantId,
      },
    })

    if (!workflow) {
      return NextResponse.json({ error: 'Workflow no encontrado' }, { status: 404 })
    }

    const body = await req.json()
    const { nombre, descripcion, trigger, configPayload, webhookUrl, activo } = body

    // Si se cambia el estado activo, sincronizar con n8n
    if (activo !== undefined && activo !== workflow.activo) {
      await automationService.toggleWorkflow(params.id, user.tenantId, activo)
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

    // Log de auditoría
    await prisma.auditLog.create({
      data: {
        tenantId: user.tenantId,
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
}

/**
 * DELETE /api/automation/external/workflows/[id]
 * Elimina un workflow de Volkern (no de n8n)
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email! },
      include: { tenant: true },
    })

    if (!user?.tenantId) {
      return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })
    }

    const workflow = await prisma.n8nWorkflow.findFirst({
      where: {
        id: params.id,
        tenantId: user.tenantId,
      },
    })

    if (!workflow) {
      return NextResponse.json({ error: 'Workflow no encontrado' }, { status: 404 })
    }

    await prisma.n8nWorkflow.delete({
      where: { id: params.id },
    })

    // Log de auditoría
    await prisma.auditLog.create({
      data: {
        tenantId: user.tenantId,
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
}
