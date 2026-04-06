export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { n8nClient } from '@/lib/n8n-client'
import { triggerAutomation } from '@/lib/automation-engine'

/**
 * POST /api/webhooks/n8n/trigger
 * Permite que n8n dispare automatizaciones en Volkern
 * Usado para flujos bidireccionales donde n8n necesita ejecutar lógica en el CRM
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
        console.warn('[n8n Trigger] Invalid signature')
        return NextResponse.json({ error: 'Firma inválida' }, { status: 401 })
      }
    }

    const data = JSON.parse(body)
    const {
      tenantId,
      trigger,
      event,
      leadId,
      citaId,
      estudianteId,
      cursoId,
      customData,
    } = data

    if (!tenantId || (!trigger && !event)) {
      return NextResponse.json(
        { error: 'tenantId y trigger/event son requeridos' },
        { status: 400 }
      )
    }

    // Verificar que el tenant existe
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
    })

    if (!tenant) {
      return NextResponse.json(
        { error: 'Tenant no encontrado' },
        { status: 404 }
      )
    }

    console.log('[n8n Trigger] Received:', {
      tenantId,
      trigger: trigger || event,
      leadId,
    })

    // Ejecutar automatizaciones de Volkern con este trigger
    const triggerName = trigger || event
    await triggerAutomation(triggerName, {
      tenantId,
      leadId,
      citaId,
      estudianteId,
      cursoId,
      ...customData,
    })

    // Log de auditoría - Los triggers de n8n no se registran directamente
    // ya que no hay un userId válido del sistema
    console.log('[n8n Trigger] Procesado:', { tenantId, trigger: triggerName })

    return NextResponse.json({
      success: true,
      message: 'Trigger procesado',
      trigger: triggerName,
    })
  } catch (error: any) {
    console.error('[n8n Trigger] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Error procesando trigger' },
      { status: 500 }
    )
  }
}

/**
 * GET /api/webhooks/n8n/trigger
 * Verificación de salud del endpoint
 */
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    endpoint: 'n8n-trigger',
    timestamp: new Date().toISOString(),
  })
}
