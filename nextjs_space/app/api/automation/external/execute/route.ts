export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { withTenantAuth } from '@/lib/api-key-auth'
import { automationService, VolkernAutomationConfig } from '@/lib/automation-service'

export const POST = withTenantAuth(async (req, auth) => {
  try {
    const tenantId = auth.tenant!.id
    const user = auth.user!

    const body = await req.json()
    const { workflowId, payload, timeout, retryCount, trigger } = body

    if (!workflowId) {
      return NextResponse.json(
        { error: 'workflowId es requerido' },
        { status: 400 }
      )
    }

    const config: VolkernAutomationConfig = {
      tenantId,
      trigger: trigger || 'manual',
      payload: payload || {},
      timeout: timeout || 30000,
      retryCount: retryCount ?? 3,
    }

    const result = await automationService.executeExternalWorkflow(workflowId, config)

    await prisma.auditLog.create({
      data: {
        tenantId,
        userId: user.id,
        accion: 'execute_external_workflow',
        entidad: 'N8nWorkflow',
        entidadId: workflowId,
        descripcion: `Ejecución de workflow externo: ${result.success ? 'exitosa' : 'fallida'}`,
        cambiosDespues: {
          success: result.success,
          duration: result.duration,
          error: result.error,
        },
      },
    })

    if (!result.success) {
      return NextResponse.json(
        { error: result.error, duration: result.duration },
        { status: 500 }
      )
    }

    return NextResponse.json(result)
  } catch (error: any) {
    console.error('[API] Error executing external workflow:', error)
    return NextResponse.json(
      { error: error.message || 'Error interno' },
      { status: 500 }
    )
  }
}, ['automations:write'])
