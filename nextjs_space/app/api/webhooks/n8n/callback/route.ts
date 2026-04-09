export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { n8nClient } from '@/lib/n8n-client'
import { triggerAutomation } from '@/lib/automation-engine'

/**
 * POST /api/webhooks/n8n/callback
 * Recibe respuestas/callbacks de n8n después de ejecutar un workflow
 * Usado para actualizar el estado de ejecuciones en Volkern
 * y disparar automatizaciones internas basadas en el resultado
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.text()
    const signature = req.headers.get('x-n8n-signature') || req.headers.get('x-volkern-signature') || ''

    // Verificar firma si está configurada
    const webhookSecret = process.env.N8N_WEBHOOK_SECRET
    if (webhookSecret && signature) {
      const isValid = n8nClient.verifyWebhookSignature(body, signature)
      if (!isValid) {
        console.warn('[n8n Callback] Invalid signature')
        return NextResponse.json({ error: 'Firma inválida' }, { status: 401 })
      }
    }

    const data = JSON.parse(body)
    const {
      tenantId,
      automationId,
      executionId,
      workflowId,
      workflowName,
      status,
      result,
      error,
      duration,
      leadId,
      citaId,
      estudianteId,
    } = data

    console.log('[n8n Callback] Received:', {
      tenantId,
      automationId,
      executionId,
      workflowName,
      status,
    })

    // Actualizar log de ejecución si existe
    if (executionId) {
      await prisma.automationExecutionLog.updateMany({
        where: {
          executionId,
          externalWorkflowId: workflowId,
        },
        data: {
          externalStatus: status,
          externalResponse: result || error,
          duration,
        },
      })
    }

    // Actualizar estadísticas del workflow
    let workflowRecord: any = null
    if (workflowId && tenantId) {
      const updateData: any = {
        ultimaEjecucion: new Date(),
        totalEjecuciones: { increment: 1 },
      }

      if (status === 'success' || status === 'completed') {
        updateData.ejecucionesExitosas = { increment: 1 }
      } else if (status === 'error' || status === 'failed') {
        updateData.ejecucionesFallidas = { increment: 1 }
      }

      workflowRecord = await prisma.n8nWorkflow.findFirst({
        where: {
          n8nWorkflowId: workflowId,
          tenantId,
        },
      })

      if (workflowRecord) {
        await prisma.n8nWorkflow.update({
          where: { id: workflowRecord.id },
          data: updateData,
        })
      }
    }

    // Disparar triggers internos basados en el resultado del workflow
    if (tenantId) {
      const triggerContext = {
        tenantId,
        leadId,
        citaId,
        estudianteId,
        workflowId,
        workflowName: workflowName || workflowRecord?.nombre || 'Unknown',
        executionId,
        result,
        error,
        duration,
      }

      // Disparar trigger según el estado
      if (status === 'success' || status === 'completed') {
        await triggerAutomation('n8n_workflow_completado', triggerContext)
        console.log('[n8n Callback] Triggered: n8n_workflow_completado')
      } else if (status === 'error' || status === 'failed') {
        await triggerAutomation('n8n_workflow_fallido', triggerContext)
        console.log('[n8n Callback] Triggered: n8n_workflow_fallido')
      }

      // Trigger genérico para cualquier evento externo
      await triggerAutomation('evento_externo', {
        ...triggerContext,
        source: 'n8n',
        eventType: `workflow_${status}`,
      })
    }

    return NextResponse.json({
      success: true,
      message: 'Callback procesado',
      triggersDisparados: status === 'success' || status === 'completed' 
        ? ['n8n_workflow_completado', 'evento_externo']
        : status === 'error' || status === 'failed'
        ? ['n8n_workflow_fallido', 'evento_externo']
        : ['evento_externo'],
    })
  } catch (error: any) {
    console.error('[n8n Callback] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Error procesando callback' },
      { status: 500 }
    )
  }
}
