import { ActionContext, ActionResult } from './types'
import { prisma } from '../db'
import { sendWhatsAppMessage } from '../whatsapp'
import { sendEmail } from '@/lib/ses-email'
import { sendTelegramMessage, loadTelegramCredentials } from '../telegram'
import { callGemma } from '../ai/gemma-client'
import { CostControl } from './cost-control'

const ACTION_HANDLERS: Map<string, (context: ActionContext, config?: Record<string, unknown>) => Promise<ActionResult>> = new Map()

export class VolkernActionRegistry {
  static register() {
    ACTION_HANDLERS.set('assign_owner', VolkernActionRegistry.assignOwner)
    ACTION_HANDLERS.set('send_whatsapp', VolkernActionRegistry.sendWhatsApp)
    ACTION_HANDLERS.set('send_whatsapp_dynamic', VolkernActionRegistry.sendWhatsAppDynamic)
    ACTION_HANDLERS.set('send_email', VolkernActionRegistry.sendEmail)
    ACTION_HANDLERS.set('send_telegram', VolkernActionRegistry.sendTelegram)
    ACTION_HANDLERS.set('update_stage', VolkernActionRegistry.updateStage)
    ACTION_HANDLERS.set('create_task', VolkernActionRegistry.createTask)
    ACTION_HANDLERS.set('add_note', VolkernActionRegistry.addNote)
    ACTION_HANDLERS.set('run_ai', VolkernActionRegistry.runAI)
    ACTION_HANDLERS.set('notify_owner', VolkernActionRegistry.notifyOwner)
    ACTION_HANDLERS.set('webhook', VolkernActionRegistry.webhook)
    ACTION_HANDLERS.set('delay', VolkernActionRegistry.delay)
  }

  static registerAction(name: string, handler: (context: ActionContext, config?: Record<string, unknown>) => Promise<ActionResult>) {
    ACTION_HANDLERS.set(name, handler)
  }

  static async execute(action: string, context: ActionContext, config?: Record<string, unknown>): Promise<ActionResult> {
    const handler = ACTION_HANDLERS.get(action)
    if (!handler) {
      return { success: false, error: `Action not found: ${action}` }
    }
    const start = Date.now()
    try {
      const result = await handler(context, config)
      return { ...result, execution_time_ms: Date.now() - start }
    } catch (error) {
      return { success: false, error: String(error), execution_time_ms: Date.now() - start }
    }
  }

  static list(): string[] {
    return Array.from(ACTION_HANDLERS.keys())
  }

  private static async assignOwner(context: ActionContext, config?: Record<string, unknown>): Promise<ActionResult> {
    const { tenant_id, data } = context
    const lead_id = data.lead_id as string
    const owner_id = config?.user_id as string || config?.owner_id as string
    
    if (!lead_id || !owner_id) {
      return { success: false, error: 'lead_id and owner_id required' }
    }

    await prisma.lead.update({
      where: { id: lead_id },
      data: { userId: owner_id } as any
    })

    return { success: true, data: { lead_id, owner_id } }
  }

  private static async sendWhatsApp(context: ActionContext, config?: Record<string, unknown>): Promise<ActionResult> {
    const { data, tenant_id } = context
    const phone = data.phone as string || data.telefono as string
    const template = config?.template as string || 'welcome'
    
    if (!phone) {
      return { success: false, error: 'phone required' }
    }

    const templates: Record<string, string> = {
      welcome: 'Hola, gracias por contactarnos. ¿En qué puedo ayudarte hoy?',
      followup: 'Hola, solo wantedo saber si tienes alguna duda. ¿Te gustaría que agendemos una llamada?',
      default: 'Gracias por tu interés. Te contactaremos pronto.'
    }

    const message = templates[template] || templates.default
    const result = await sendWhatsAppMessage(phone, message, tenant_id)

    return { success: result.success, error: result.error }
  }

  private static async sendWhatsAppDynamic(context: ActionContext, config?: Record<string, unknown>): Promise<ActionResult> {
    const { data, tenant_id } = context
    const phone = data.phone as string || data.telefono as string
    const message_template = config?.message as string || 'Hola {nombre}, ¿cómo estás?'
    
    if (!phone) {
      return { success: false, error: 'phone required' }
    }

    const nombre = data.nombre as string || 'Cliente'
    const message = message_template.replace('{nombre}', nombre)
    const result = await sendWhatsAppMessage(phone, message, tenant_id)

    return { success: result.success, error: result.error }
  }

  private static async sendEmail(context: ActionContext, config?: Record<string, unknown>): Promise<ActionResult> {
    const { data } = context
    const to = data.email as string
    const subject = config?.subject as string || 'Gracias por tu interés'
    const body = config?.body as string || 'Te contactaremos pronto.'
    
    if (!to) {
      return { success: false, error: 'email required' }
    }

    await (sendEmail as any)({
      to, 
      subject, 
      html: body, 
      text: body,
      tenantSubdomain: context.tenant_id 
    })

    return { success: true, data: { to, subject } }
  }

  private static async sendTelegram(context: ActionContext, config?: Record<string, unknown>): Promise<ActionResult> {
    const { tenant_id, data } = context
    const creds = await (loadTelegramCredentials as any)(tenant_id)
    
    if (!creds?.admin_chat_id) {
      return { success: false, error: 'Telegram not configured' }
    }

    const message = config?.message as string || 'Notificación de Volkern'
    await sendTelegramMessage(creds.admin_chat_id, message)

    return { success: true }
  }

  private static async updateStage(context: ActionContext, config?: Record<string, unknown>): Promise<ActionResult> {
    const { data } = context
    const lead_id = data.lead_id as string
    const stage = config?.stage as string
    
    if (!lead_id || !stage) {
      return { success: false, error: 'lead_id and stage required' }
    }

    await prisma.lead.update({
      where: { id: lead_id },
      data: { estado: stage }
    })

    return { success: true, data: { lead_id, stage } }
  }

  private static async createTask(context: ActionContext, config?: Record<string, unknown>): Promise<ActionResult> {
    const { tenant_id, data } = context
    const lead_id = data.lead_id as string
    const title = config?.title as string || 'Seguimiento'
    const description = config?.description as string || ''
    
    if (!lead_id) {
      return { success: false, error: 'lead_id required' }
    }

    const task = await prisma.task.create({
      data: {
        tenantId: tenant_id,
        leadId: lead_id,
        titulo: title,
        descripcion: description,
        estado: 'pendiente'
      } as any
    })

    return { success: true, data: { task_id: task.id } }
  }

  private static async addNote(context: ActionContext, config?: Record<string, unknown>): Promise<ActionResult> {
    const { tenant_id, data } = context
    const lead_id = data.lead_id as string
    const contenido = config?.content as string || config?.note as string || ''
    
    if (!lead_id || !contenido) {
      return { success: false, error: 'lead_id and content required' }
    }

    const nota = await (prisma as any).nota.create({
      data: {
        tenantId: tenant_id,
        leadId: lead_id,
        contenido
      }
    })

    return { success: true, data: { nota_id: nota.id } }
  }

  private static async runAI(context: ActionContext, config?: Record<string, unknown>): Promise<ActionResult> {
    const { data, tenant_id } = context
    const agent = config?.agent as string
    const lead_id = data.lead_id as string

    if (!agent) {
      return { success: false, error: 'agent is required' }
    }

    const costCheck = await CostControl.checkAIAction(tenant_id, agent)
    if (!costCheck.allowed) {
      const fallback = CostControl.generateFallbackResponse(agent)
      return { 
        success: false, 
        error: costCheck.reason,
        data: { fallback, used_fallback: true }
      }
    }

    await CostControl.recordAIAction(tenant_id, agent)

    const prompts: Record<string, { system: string; user: string }> = {
      lead_classifier: {
        system: 'Eres un clasificador de leads. Clasifica en A (80-100), B (60-79), C (40-59), D (0-39). Responde solo JSON: {"score": number, "category": "A"|"B"|"C"|"D", "notes": "..."}',
        user: `Lead: ${JSON.stringify(data)}`
      },
      followup_generator: {
        system: 'Eres un asistente de ventas. Genera un mensaje de seguimiento corto y personalizado.',
        user: `Datos: ${JSON.stringify(data)}`
      },
      ghosting_recovery: {
        system: 'Eres un experto en recuperación de leads. Genera un mensaje persuasivo para recuperar un lead frío/inactivo.',
        user: `Datos: ${JSON.stringify(data)}`
      },
      deal_strategy: {
        system: 'Eres un estratega de ventas. Sugiere 3 siguientes pasos para cerrar el deal.',
        user: `Deal: ${JSON.stringify(data)}`
      },
      response_assistant: {
        system: 'Eres un asistente de ventas. Sugiere una respuesta profesional al mensaje del cliente.',
        user: `Mensaje: ${data.mensaje || 'N/A'}`
      }
    }

    if (!agent || !prompts[agent]) {
      return { success: false, error: `Unknown agent: ${agent}` }
    }

    const prompt = prompts[agent]
    const result = await callGemma([
      { role: 'system', content: prompt.system },
      { role: 'user', content: prompt.user }
    ])

    if (result.error) {
      return { success: false, error: result.error }
    }

    let parsed: Record<string, unknown> = {}
    try {
      const cleaned = result.content.replace(/```json/g, '').replace(/```/g, '').trim()
      parsed = JSON.parse(cleaned)
    } catch {
      parsed = { response: result.content }
    }

    if (lead_id && parsed.score !== undefined) {
      await prisma.lead.update({
        where: { id: lead_id },
        data: { scoreValue: parsed.score as number }
      })
    }

    return { success: true, data: { agent, result: parsed } }
  }

  private static async notifyOwner(context: ActionContext, config?: Record<string, unknown>): Promise<ActionResult> {
    const { tenant_id, data } = context
    const message = config?.message as string || 'Nueva actualización de lead'
    
    const leads = await prisma.lead.findUnique({ where: { id: data.lead_id as string }, include: { asignadoUsuario: true } as any })
    const owner = (leads as any)?.asignadoUsuario

    if (owner?.telefono) {
      await sendWhatsAppMessage(owner.telefono, message, tenant_id)
    }

    return { success: true }
  }

  private static async webhook(context: ActionContext, config?: Record<string, unknown>): Promise<ActionResult> {
    const url = config?.url as string
    const method = config?.method as string || 'POST'
    
    if (!url) {
      return { success: false, error: 'url required' }
    }

    await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(context.data)
    })

    return { success: true }
  }

  private static async delay(context: ActionContext, config?: Record<string, unknown>): Promise<ActionResult> {
    const ms = (config?.seconds as number || config?.minutes as number * 60 || 60) * 1000
    await new Promise(resolve => setTimeout(resolve, ms))
    return { success: true, data: { delayed_ms: ms } }
  }
}

VolkernActionRegistry.register()

export const actionRegistry = {
  execute: VolkernActionRegistry.execute.bind(VolkernActionRegistry),
  list: VolkernActionRegistry.list.bind(VolkernActionRegistry),
  register: VolkernActionRegistry.registerAction.bind(VolkernActionRegistry)
}