export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { withTenantAuth } from '@/lib/api-key-auth'
import { automationService } from '@/lib/automation-service'

export const GET = withTenantAuth(async (req, auth) => {
  try {
    const tenantId = auth.tenant!.id
    const { searchParams } = new URL(req.url)
    const trigger = searchParams.get('trigger')
    const activeOnly = searchParams.get('activeOnly') !== 'false'

    let workflows
    if (trigger) {
      workflows = await automationService.getWorkflowsByTrigger(tenantId, trigger)
    } else {
      workflows = await automationService.listWorkflows(tenantId, activeOnly)
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
}, ['automations:read'])

export const POST = withTenantAuth(async (req, auth) => {
  try {
    const tenantId = auth.tenant!.id
    const user = auth.user!
    const body = await req.json()
    const { n8nWorkflowId, nombre, descripcion, trigger, configPayload, webhookUrl } = body

    if (!n8nWorkflowId || !nombre || !trigger) {
      return NextResponse.json(
        { error: 'n8nWorkflowId, nombre y trigger son requeridos' },
        { status: 400 }
      )
    }

    const workflow = await automationService.registerWorkflow(tenantId, n8nWorkflowId, {
      nombre,
      descripcion,
      trigger,
      configPayload,
      webhookUrl,
    })

    await prisma.auditLog.create({
      data: {
        tenantId,
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
}, ['automations:write'])
