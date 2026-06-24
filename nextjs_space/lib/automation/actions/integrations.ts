import { prisma } from '@/lib/db'
import { ActionContext } from '../types'
import { InvoicingService } from '@/lib/invoicing-service'
import { getFiscalConfig, getFiscalConfigForWebhook } from '@/lib/fiscal-engine'
import { sendEmail } from './communication'
import { sendWhatsApp } from './communication'

/**
 * Factura simple (crear_factura_stripe, crear_factura_square, cobrar_gocardless)
 */
export async function generateSimpleInvoice(config: any, ctx: ActionContext): Promise<boolean> {
  const { amount, currency = 'EUR', description, items = [] } = config
  const tenantId = ctx.state.tenantId
  if (!tenantId) return false

  try {
    await InvoicingService.createInvoice({
      tenantId,
      leadId: ctx.state.leadId as string | undefined,
      contactId: ctx.state.contactId as string | undefined,
      amount: amount || 0,
      currency,
      description: description || 'Factura generada desde automatización',
      items: items.length > 0 ? items : [{ name: 'Servicio', quantity: 1, price: amount || 0 }],
    })
    return true
  } catch (error) {
    console.error('Error generando factura en automatización:', error)
    return false
  }
}

export async function sendGoCardlessMandate(config: any, ctx: ActionContext): Promise<boolean> {
  const { channel = 'email' } = config
  const tenantId = ctx.state.tenantId
  const leadId = ctx.state.leadId
  const contactId = ctx.state.contactId
  if (!tenantId) return false

  try {
    const { authorizationUrl } = await InvoicingService.getOrCreateGoCardlessMandateLink(tenantId, leadId as string | undefined, contactId as string | undefined)
    const message = `Hola, para procesar tus pagos por domiciliación bancaria, por favor autoriza el mandato aquí: ${authorizationUrl}`

    if (channel === 'whatsapp') {
      return sendWhatsApp({ message }, ctx)
    } else {
      return sendEmail({ subject: 'Autorización de Domiciliación Bancaria', message: `<p>${message}</p>` }, ctx)
    }
  } catch (error) {
    console.error('Error enviando mandato GoCardless en automatización:', error)
    return false
  }
}

export async function sendWebhook(config: any, ctx: ActionContext): Promise<boolean> {
  const { url, method = 'POST', headers = {}, includeLeadData = true, includeFiscalConfig = true } = config
  if (!url) return false

  try {
    const payload: any = {
      event: 'automation_triggered',
      timestamp: new Date().toISOString(),
      automation: { id: ctx.automationId, executionId: ctx.executionId },
    }

    if (includeLeadData && ctx.state.lead) {
      payload.lead = {
        id: ctx.state.lead.id,
        nombre: ctx.state.lead.nombre,
        email: ctx.state.lead.email,
        telefono: ctx.state.lead.telefono,
        estado: ctx.state.lead.estado,
        score: ctx.state.lead.scoreValue,
        tags: ctx.state.lead.tags,
      }
    }

    if (includeFiscalConfig && ctx.state.tenantId) {
      try {
        const fiscalConfig = await getFiscalConfig(ctx.state.tenantId, { leadId: ctx.state.leadId })
        payload.fiscal_config = getFiscalConfigForWebhook(fiscalConfig)
      } catch (fiscalError) {
        console.warn('No se pudo obtener configuración fiscal para webhook:', fiscalError)
      }
    }

    const response = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(payload),
    })
    return response.ok
  } catch (error) {
    console.error('Error enviando webhook:', error)
    return false
  }
}

export async function executeExternalWorkflow(config: any, ctx: ActionContext): Promise<boolean> {
  const { templateId, payload = {}, timeout = 30000 } = config
  if (!templateId) { console.error('[Automation] templateId no proporcionado'); return false }
  if (!ctx.state.tenantId) { console.error('[Automation] tenantId no proporcionado'); return false }

  const startTime = Date.now()
  try {
    const { workflowTemplateService } = await import('@/lib/workflow-template-service')
    const enrichedPayload = {
      ...payload,
      lead: ctx.state.lead ? { id: ctx.state.lead.id, nombre: ctx.state.lead.nombre, email: ctx.state.lead.email, telefono: ctx.state.lead.telefono, estado: ctx.state.lead.estado, score: ctx.state.lead.scoreValue, tags: ctx.state.lead.tags } : undefined,
      estudiante: ctx.state.estudiante ? { id: ctx.state.estudiante.id, nombre: ctx.state.estudiante.nombre, email: ctx.state.estudiante.email } : undefined,
      cita: ctx.state.cita ? { id: ctx.state.cita.id, titulo: ctx.state.cita.titulo, fechaHora: ctx.state.cita.fechaHora, estado: ctx.state.cita.estado } : undefined,
    }

    const result = await workflowTemplateService.executeWorkflow(ctx.state.tenantId, templateId, enrichedPayload, { timeout, automationId: ctx.automationId, executionId: ctx.executionId })
    const duration = Date.now() - startTime

    await prisma.automationExecutionLog.create({
      data: {
        executionId: ctx.executionId, nodeId: 'external_workflow', nodeType: 'ejecutar_workflow',
        status: result.success ? 'success' : 'error',
        message: result.success ? 'Workflow ejecutado correctamente' : result.error,
        data: { templateId, response: result.response },
        externalWorkflowId: templateId, externalStatus: result.success ? 'completed' : 'failed',
        externalResponse: result.response, duration,
      },
    })
    return result.success
  } catch (error: any) {
    console.error('[Automation] Error ejecutando workflow:', error)
    await prisma.automationExecutionLog.create({
      data: {
        executionId: ctx.executionId, nodeId: 'external_workflow', nodeType: 'ejecutar_workflow',
        status: 'error', message: error.message, externalWorkflowId: templateId,
        externalStatus: 'error', duration: Date.now() - startTime,
      },
    })
    return false
  }
}

export async function sendSecureWebhook(config: any, ctx: ActionContext): Promise<boolean> {
  const { url, method = 'POST', headers = {}, payload = {}, secret, timeout = 30000, retryCount = 3 } = config
  if (!url) return false

  try {
    const fullPayload = {
      event: 'volkern_automation',
      timestamp: new Date().toISOString(),
      automation: { id: ctx.automationId, executionId: ctx.executionId },
      tenantId: ctx.state.tenantId,
      data: { ...payload, lead: ctx.state.lead ? { id: ctx.state.lead.id, nombre: ctx.state.lead.nombre, email: ctx.state.lead.email, telefono: ctx.state.lead.telefono } : undefined },
    }

    const bodyString = JSON.stringify(fullPayload)
    const requestHeaders: Record<string, string> = { 'Content-Type': 'application/json', ...headers }

    if (secret) {
      const crypto = await import('crypto')
      const signature = crypto.createHmac('sha256', secret).update(bodyString).digest('hex')
      requestHeaders['X-Volkern-Signature'] = signature
      requestHeaders['X-Volkern-Timestamp'] = new Date().toISOString()
    }

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeout)

    for (let attempt = 0; attempt <= (retryCount || 0); attempt++) {
      try {
        if (attempt > 0) await new Promise(r => setTimeout(r, 1000 * attempt))
        const response = await fetch(url, { method, headers: requestHeaders, body: bodyString, signal: controller.signal })
        clearTimeout(timeoutId)
        if (response.ok) return true
      } catch (error: any) { /* retry */ }
    }
    clearTimeout(timeoutId)
    return false
  } catch (error: any) {
    console.error('[Automation] Error enviando webhook seguro:', error)
    return false
  }
}

export async function pauseAutomation(config: any, ctx: ActionContext): Promise<boolean> {
  const { automationId } = config
  if (!automationId) return false
  const automation = await prisma.automation.findFirst({ where: { id: automationId, tenantId: ctx.state.tenantId } })
  if (!automation) return false
  await prisma.automation.update({ where: { id: automationId }, data: { activo: false } })
  return true
}

export async function activateAutomation(config: any, ctx: ActionContext): Promise<boolean> {
  const { automationId } = config
  if (!automationId) return false
  const automation = await prisma.automation.findFirst({ where: { id: automationId, tenantId: ctx.state.tenantId } })
  if (!automation) return false
  await prisma.automation.update({ where: { id: automationId }, data: { activo: true } })
  return true
}
