export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { automationService, VolkernAutomationConfig } from '@/lib/automation-service'
import { prisma } from '@/lib/db'

/**
 * POST /api/automation/external/execute
 * Ejecuta un workflow externo (n8n) con los datos proporcionados
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
    const { workflowId, payload, timeout, retryCount, trigger } = body

    if (!workflowId) {
      return NextResponse.json(
        { error: 'workflowId es requerido' },
        { status: 400 }
      )
    }

    const config: VolkernAutomationConfig = {
      tenantId: user.tenantId,
      trigger: trigger || 'manual',
      payload: payload || {},
      timeout: timeout || 30000,
      retryCount: retryCount ?? 3,
    }

    const result = await automationService.executeExternalWorkflow(workflowId, config)

    // Registrar en log de auditoría
    await prisma.auditLog.create({
      data: {
        tenantId: user.tenantId,
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
}
