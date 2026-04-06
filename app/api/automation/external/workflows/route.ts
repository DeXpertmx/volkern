export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { automationService } from '@/lib/automation-service'
import { prisma } from '@/lib/db'

/**
 * GET /api/automation/external/workflows
 * Lista workflows disponibles para el tenant
 */
export async function GET(req: NextRequest) {
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

    const { searchParams } = new URL(req.url)
    const trigger = searchParams.get('trigger')
    const activeOnly = searchParams.get('activeOnly') !== 'false'

    let workflows
    if (trigger) {
      workflows = await automationService.getWorkflowsByTrigger(user.tenantId, trigger)
    } else {
      workflows = await automationService.listWorkflows(user.tenantId, activeOnly)
    }

    return NextResponse.json({
      success: true,
      workflows,
    })
  } catch (error: any) {
    console.error('[API] Error listing workflows:', error)
    return NextResponse.json(
      { error: error.message || 'Error listando workflows' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/automation/external/workflows
 * Registra un nuevo workflow de n8n en Volkern
 */
export async function POST(req: NextRequest) {
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

    const body = await req.json()
    const { n8nWorkflowId, nombre, descripcion, trigger, configPayload, webhookUrl } = body

    if (!n8nWorkflowId || !nombre || !trigger) {
      return NextResponse.json(
        { error: 'n8nWorkflowId, nombre y trigger son requeridos' },
        { status: 400 }
      )
    }

    const workflow = await automationService.registerWorkflow(user.tenantId, n8nWorkflowId, {
      nombre,
      descripcion,
      trigger,
      configPayload,
      webhookUrl,
    })

    // Log de auditoría
    await prisma.auditLog.create({
      data: {
        tenantId: user.tenantId,
        userId: user.id,
        accion: 'register_n8n_workflow',
        entidad: 'N8nWorkflow',
        entidadId: workflow.id,
        descripcion: `Workflow registrado: ${nombre}`,
        cambiosDespues: { n8nWorkflowId, nombre, trigger },
      },
    })

    return NextResponse.json({
      success: true,
      workflow,
    })
  } catch (error: any) {
    console.error('[API] Error registering workflow:', error)
    return NextResponse.json(
      { error: error.message || 'Error registrando workflow' },
      { status: 500 }
    )
  }
}
