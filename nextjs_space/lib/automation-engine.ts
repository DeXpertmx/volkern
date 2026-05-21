
import { prisma } from './db'
import { Node, Edge } from 'reactflow'
import { sendWhatsAppMessage } from './whatsapp'
import { sendEmail as sendSESEmail } from './ses-email'
import { sendSMS as sendTwilioSMS } from './sms'
import { sendTelegramMessage, loadTelegramCredentials } from './telegram'
import { getFiscalConfig, getFiscalConfigForWebhook } from './fiscal-engine'
import { automationService } from './automation-service'
import { notificationService } from './skills/notification-layer'
import { createSystemContext } from './skills/context'
import { InvoicingService } from './invoicing-service'

interface ExecutionContext {
  tenantId?: string
  leadId?: string
  citaId?: string
  servicioId?: string
  estudianteId?: string
  cursoId?: string
  inscripcionId?: string
  lead?: any
  cita?: any
  estudiante?: any
  curso?: any
  inscripcion?: any
  [key: string]: any
}

export class AutomationEngine {
  private executionId: string
  private automationId: string
  private context: ExecutionContext
  private nodes: Node[]
  private edges: Edge[]

  constructor(automationId: string, context: ExecutionContext) {
    this.automationId = automationId
    this.context = context
    this.nodes = []
    this.edges = []
    this.executionId = ''
  }

  async execute() {
    const executionTimeout = 60000 // 60 segundos máximo por ejecución
    const timeoutId = setTimeout(async () => {
      await this.logError(`Timeout: ejecución excedió ${executionTimeout / 1000}s`)
    }, executionTimeout)

    try {
      // Crear registro de ejecución
      const execution = await prisma.automationExecution.create({
        data: {
          automationId: this.automationId,
          estado: 'ejecutando',
          contextData: this.context,
        },
      })
      this.executionId = execution.id

      // Cargar la automatización
      const automation = await prisma.automation.findUnique({
        where: { id: this.automationId },
      })

      if (!automation || !automation.activo) {
        await this.logError('Automatización no encontrada o inactiva')
        clearTimeout(timeoutId)
        return
      }

      const flowData = automation.flowData as any
      this.nodes = flowData.nodes || []
      this.edges = flowData.edges || []

      // Enriquecer contexto con datos del lead
      if (this.context.leadId) {
        this.context.lead = await prisma.lead.findUnique({
          where: { id: this.context.leadId },
          include: { perfilFiscal: true }
        })
      }

      if (this.context.citaId) {
        this.context.cita = await prisma.cita.findUnique({
          where: { id: this.context.citaId },
          include: {
            lead: { include: { perfilFiscal: true } },
            servicio: true,
          },
        })
        if (this.context.cita) {
          this.context.lead = this.context.cita.lead
        }
      }

      // Enriquecer contexto con datos del estudiante
      if (this.context.estudianteId) {
        this.context.estudiante = await prisma.estudiante.findUnique({
          where: { id: this.context.estudianteId },
        })
      }

      if (this.context.cursoId) {
        this.context.curso = await prisma.curso.findUnique({
          where: { id: this.context.cursoId },
        })
      }

      if (this.context.inscripcionId) {
        this.context.inscripcion = await prisma.inscripcion.findUnique({
          where: { id: this.context.inscripcionId },
          include: {
            estudiante: true,
            curso: true,
          },
        })
        if (this.context.inscripcion) {
          this.context.estudiante = this.context.inscripcion.estudiante
          this.context.curso = this.context.inscripcion.curso
        }
      }

      // Encontrar nodo trigger
      const triggerNode = this.nodes.find((n) => n.type === 'trigger')
      if (!triggerNode) {
        await this.logError('No se encontró nodo trigger')
        return
      }

      // Ejecutar flujo
      await this.executeNode(triggerNode.id)

      // Marcar como completado
      await prisma.automationExecution.update({
        where: { id: this.executionId },
        data: {
          estado: 'completado',
          fechaFin: new Date(),
        },
      })
    } catch (error: any) {
      await this.logError(error.message)
    } finally {
      clearTimeout(timeoutId)
    }
  }

  private async executeNode(nodeId: string): Promise<boolean> {
    const node = this.nodes.find((n) => n.id === nodeId)
    if (!node) return false

    try {
      let success = true

      switch (node.type) {
        case 'trigger':
          success = await this.executeTrigger(node)
          break
        case 'action':
          success = await this.executeAction(node)
          break
        case 'condition':
          return await this.executeCondition(node)
        case 'delay':
          success = await this.executeDelay(node)
          break
      }

      // Log exitoso
      await this.log(node.id, node.type || 'unknown', 'success', 'Nodo ejecutado correctamente')

      // Ejecutar siguiente nodo
      if (success) {
        const nextEdge = this.edges.find((e) => e.source === nodeId)
        if (nextEdge) {
          await this.executeNode(nextEdge.target)
        }
      }

      return success
    } catch (error: any) {
      await this.log(node.id, node.type || 'unknown', 'error', error.message)
      return false
    }
  }

  private async executeTrigger(node: Node): Promise<boolean> {
    // El trigger ya se activó, solo registramos
    return true
  }

  private async executeAction(node: Node): Promise<boolean> {
    const config = node.data.config || {}

    switch (config.actionType) {
      // Comunicación
      case 'enviar_email':
        return await this.sendEmail(config)
      case 'enviar_sms':
        return await this.sendSMS(config)
      case 'enviar_whatsapp':
        return await this.sendWhatsApp(config)
      case 'enviar_telegram':
        return await this.sendTelegram(config)
      case 'enviar_notificacion':
        return await this.sendNotification(config)

      // Gestión de Leads
      case 'actualizar_lead':
        return await this.updateLead(config)
      case 'cambiar_etapa_lead':
        return await this.updateLead({ newStatus: config.newStatus })
      case 'asignar_tag':
        return await this.assignTag(config)
      case 'remover_tag':
        return await this.removeTag(config)
      case 'asignar_a_usuario':
        return await this.assignLeadToUser(config)
      case 'actualizar_score':
        return await this.updateLeadScore(config)
      case 'calcular_score_automatico':
        return await this.calculateAutoScore(config)
      case 'crear_deal':
        return await this.createDeal(config)
      case 'archivar_lead':
        return await this.archiveLead(config)
      case 'duplicar_lead':
        return await this.duplicateLead(config)

      // Gestión de Estudiantes
      case 'actualizar_estudiante':
        return await this.updateEstudiante(config)
      case 'inscribir_en_curso':
        return await this.enrollInCourse(config)
      case 'enviar_certificado':
        return await this.sendCertificate(config)

      // Tareas y Organización
      case 'crear_tarea':
        return await this.createTask(config)
      case 'crear_cita':
        return await this.createAppointment(config)

      // Campañas
      case 'agregar_a_campana':
        return await this.addToCampaign(config)
      case 'remover_de_campana':
        return await this.removeFromCampaign(config)

      // Integraciones
      case 'webhook_saliente':
        return await this.sendWebhook(config)
      case 'crear_factura_stripe':
      case 'crear_factura_square':
      case 'cobrar_gocardless':
        return await this.generateInvoice(config)
      case 'enviar_mandato_gocardless':
        return await this.sendGoCardlessMandate(config)
      
      // Workflows Externos (n8n)
      case 'ejecutar_workflow':
        return await this.executeExternalWorkflow(config)
      case 'webhook_externo_seguro':
        return await this.sendSecureWebhook(config)

      // Control de Flujo
      case 'pausar_automatizacion':
        return await this.pauseAutomation(config)
      case 'activar_automatizacion':
        return await this.activateAutomation(config)

      // ============== FASE 1: INVENTARIO ==============
      case 'notificar_stock':
        return await this.notifyLowStock(config)
      case 'actualizar_inventario':
        return await this.updateInventory(config)
      case 'crear_orden_compra':
        return await this.createPurchaseOrder(config)
      case 'ajustar_stock':
        return await this.adjustStock(config)

      // ============== FASE 1: PRODUCCIÓN ==============
      case 'crear_orden_produccion':
        return await this.createProductionOrder(config)
      case 'actualizar_estado_orden':
        return await this.updateProductionOrderStatus(config)
      case 'notificar_produccion':
        return await this.notifyProduction(config)
      case 'registrar_produccion':
        return await this.registerProduction(config)

      // ============== FASE 1: SOPORTE ==============
      case 'crear_ticket':
        return await this.createSupportTicket(config)
      case 'asignar_ticket':
        return await this.assignTicket(config)
      case 'escalar_ticket':
        return await this.escalateTicket(config)
      case 'notificar_sla':
        return await this.notifySLA(config)
      case 'cerrar_ticket':
        return await this.closeTicket(config)
      case 'crear_tarea_desde_ticket':
        return await this.createTaskFromTicket(config)

      // ============== FASE 2: MARKETING ==============
      case 'crear_campana':
        return await this.createCampaign(config)
      case 'agregar_contacto_lista':
        return await this.addContactToList(config)
      case 'remover_contacto_lista':
        return await this.removeContactFromList(config)
      case 'segmentar_audiencia':
        return await this.segmentAudience(config)
      case 'programar_post':
        return await this.scheduleSocialPost(config)
      case 'publicar_post':
        return await this.publishSocialPost(config)
      case 'enviar_seguimiento':
        return await this.sendFollowUp(config)
      case 'actualizar_nurturing':
        return await this.updateNurturing(config)
      case 'calcular_engagement':
        return await this.calculateEngagement(config)
      case 'generar_reporte_campana':
        return await this.generateCampaignReport(config)

      // ============== FASE 2: EMAIL MARKETING ==============
      case 'enviar_email_marketing':
        return await this.sendMarketingEmail(config)
      case 'crear_sequence':
        return await this.createEmailSequence(config)
      case 'pausar_sequence':
        return await this.pauseEmailSequence(config)

      // ============== FASE 3: RRHH ==============
      case 'enviar_onboarding':
        return await this.sendOnboarding(config)
      case 'crear_evaluacion':
        return await this.createEvaluation(config)
      case 'enviar_encuesta':
        return await this.sendSurvey(config)
      case 'registrar_capacitacion':
        return await this.registerTraining(config)
      case 'notificar_certificacion':
        return await this.notifyCertification(config)
      case 'actualizar_empleado':
        return await this.updateEmployee(config)
      case 'asignar_rol':
        return await this.assignRole(config)

      // ============== FASE 3: FINANZAS ==============
      case 'generar_factura':
        return await this.generateInvoice(config)
      case 'registrar_gasto':
        return await this.registerExpense(config)
      case 'aprobar_gasto':
        return await this.approveExpense(config)
      case 'rechazar_gasto':
        return await this.rejectExpense(config)
      case 'notificar_pago':
        return await this.notifyPayment(config)
      case 'crear_nomina':
        return await this.createPayroll(config)
      case 'notificar_factura_vencida':
        return await this.notifyInvoiceOverdue(config)
      case 'enviar_recordatorio_pago':
        return await this.sendPaymentReminder(config)
      case 'ajustar_presupuesto':
        return await this.adjustBudget(config)
      case 'generar_reporte_financiero':
        return await this.generateFinancialReport(config)

      // ============== FASE 4: CALIDAD ==============
      case 'crear_inspeccion':
        return await this.createInspection(config)
      case 'registrar_no_conformidad':
        return await this.registerNonConformity(config)
      case 'cerrar_no_conformidad':
        return await this.closeNonConformity(config)
      case 'notificar_alerta_calidad':
        return await this.notifyQualityAlert(config)
      case 'generar_informe_calidad':
        return await this.generateQualityReport(config)
      case 'programar_calibracion':
        return await this.scheduleCalibration(config)

      // ============== FASE 4: PROYECTOS ==============
      case 'crear_proyecto':
        return await this.createProject(config)
      case 'notificar_equipo_proyecto':
        return await this.notifyProjectTeam(config)
      case 'actualizar_progreso':
        return await this.updateProgress(config)
      case 'crear_milestone':
        return await this.createMilestone(config)
      case 'notificar_milestone':
        return await this.notifyMilestone(config)
      case 'generar_reporte_proyecto':
        return await this.generateProjectReport(config)
      case 'crear_tarea_proyecto':
        return await this.createProjectTask(config)
      case 'asignar_entregable':
        return await this.assignDeliverable(config)

      default:
        return true
    }
  }

  private async executeCondition(node: Node): Promise<boolean> {
    const config = node.data.config || {}
    const result = this.evaluateCondition(config)

    // Log de la condición
    await this.log(
      node.id,
      'condition',
      'success',
      `Condición evaluada: ${result ? 'Verdadero' : 'Falso'}`
    )

    // Encontrar el edge correcto basado en el resultado
    const nextEdge = this.edges.find(
      (e) => e.source === node.id && e.sourceHandle === (result ? 'true' : 'false')
    )

    if (nextEdge) {
      await this.executeNode(nextEdge.target)
    }

    return true
  }

  private evaluateCondition(config: any): boolean {
    const { field, operator, value, conditionType = 'lead' } = config

    // Determinar qué entidad evaluar
    let entity: any = null
    switch (conditionType) {
      case 'lead':
        entity = this.context.lead
        break
      case 'estudiante':
        entity = this.context.estudiante
        break
      case 'curso':
        entity = this.context.curso
        break
      case 'cita':
        entity = this.context.cita
        break
      case 'inscripcion':
        entity = this.context.inscripcion
        break
      default:
        entity = this.context.lead
    }

    if (!entity) return false

    const fieldValue = entity[field]

    switch (operator) {
      // Operadores de igualdad
      case 'igual':
        return fieldValue === value
      case 'diferente':
        return fieldValue !== value

      // Operadores de texto
      case 'contiene':
        return fieldValue?.toString().toLowerCase().includes(value?.toLowerCase())
      case 'no_contiene':
        return !fieldValue?.toString().toLowerCase().includes(value?.toLowerCase())
      case 'empieza_con':
        return fieldValue?.toString().toLowerCase().startsWith(value?.toLowerCase())
      case 'termina_con':
        return fieldValue?.toString().toLowerCase().endsWith(value?.toLowerCase())

      // Operadores de existencia
      case 'vacio':
        return !fieldValue || fieldValue === '' || fieldValue === null || fieldValue === undefined
      case 'no_vacio':
        return !!fieldValue && fieldValue !== ''

      // Operadores numéricos
      case 'mayor_que':
        return parseFloat(fieldValue) > parseFloat(value)
      case 'menor_que':
        return parseFloat(fieldValue) < parseFloat(value)
      case 'mayor_igual':
        return parseFloat(fieldValue) >= parseFloat(value)
      case 'menor_igual':
        return parseFloat(fieldValue) <= parseFloat(value)

      // Operadores de fecha
      case 'antes_de':
        return new Date(fieldValue) < new Date(value)
      case 'despues_de':
        return new Date(fieldValue) > new Date(value)
      case 'entre_fechas': {
        const date = new Date(fieldValue)
        const startDate = new Date(config.startDate)
        const endDate = new Date(config.endDate)
        return date >= startDate && date <= endDate
      }
      case 'ultimos_x_dias': {
        const date = new Date(fieldValue)
        const daysAgo = new Date()
        daysAgo.setDate(daysAgo.getDate() - parseInt(value))
        return date >= daysAgo
      }

      // Operadores de arrays y tags
      case 'incluye':
        if (Array.isArray(fieldValue)) {
          return fieldValue.includes(value)
        }
        // Si es string con comas (como tags)
        if (typeof fieldValue === 'string') {
          const items = fieldValue.split(',').map(i => i.trim())
          return items.includes(value)
        }
        return false
      case 'no_incluye':
        if (Array.isArray(fieldValue)) {
          return !fieldValue.includes(value)
        }
        if (typeof fieldValue === 'string') {
          const items = fieldValue.split(',').map(i => i.trim())
          return !items.includes(value)
        }
        return true

      // Operadores booleanos
      case 'es_verdadero':
        return fieldValue === true || fieldValue === 'true' || fieldValue === 1
      case 'es_falso':
        return fieldValue === false || fieldValue === 'false' || fieldValue === 0

      default:
        return false
    }
  }

  private async executeDelay(node: Node): Promise<boolean> {
    const config = node.data.config || {}
    const { duration = 1, unit = 'hours' } = config

    // Calcular fecha de ejecución
    let millisecondsToAdd = 0
    switch (unit) {
      case 'minutes':
        millisecondsToAdd = duration * 60 * 1000
        break
      case 'hours':
        millisecondsToAdd = duration * 60 * 60 * 1000
        break
      case 'days':
        millisecondsToAdd = duration * 24 * 60 * 60 * 1000
        break
      case 'weeks':
        millisecondsToAdd = duration * 7 * 24 * 60 * 60 * 1000
        break
    }

    const scheduledFor = new Date(Date.now() + millisecondsToAdd)

    // Encontrar el siguiente nodo
    const nextEdge = this.edges.find((e) => e.source === node.id)
    if (nextEdge) {
      // Guardar la tarea programada
      await prisma.scheduledAutomationTask.create({
        data: {
          automationId: this.automationId,
          executionId: this.executionId,
          nodeId: nextEdge.target,
          contextData: this.context,
          scheduledFor,
          estado: 'pendiente',
        },
      })

      await this.log(
        node.id,
        'delay',
        'success',
        `Delay programado para ${scheduledFor.toLocaleString('es-MX')}`
      )

      // Marcar la ejecución como pausada
      await prisma.automationExecution.update({
        where: { id: this.executionId },
        data: {
          estado: 'pausado',
          currentNodeId: node.id,
        },
      })
    }

    return false // No continuar con el siguiente nodo
  }

  private async sendEmail(config: any, attempt = 1): Promise<boolean> {
    const { subject, message, maxRetries = 2 } = config
    const contacto = this.context.lead || this.context.estudiante

    if (!contacto?.email) return false

    const processedMessage = this.replaceVariables(message)
    const processedSubject = this.replaceVariables(subject)

    try {
      await sendSESEmail({
        to: contacto.email,
        subject: processedSubject,
        html: processedMessage,
        tenantSubdomain: this.context.tenantId,
      })
      return true
    } catch (error) {
      console.error(`Error enviando email (intento ${attempt}/${maxRetries + 1}):`, error)
      if (attempt <= maxRetries) {
        await new Promise(r => setTimeout(r, 1000 * attempt))
        return this.sendEmail(config, attempt + 1)
      }
      return false
    }
  }

  private async sendSMS(config: any, attempt = 1): Promise<boolean> {
    const { message, maxRetries = 2 } = config
    const contacto = this.context.lead || this.context.estudiante

    if (!contacto?.telefono) return false

    const processedMessage = this.replaceVariables(message)

    try {
      await sendTwilioSMS(contacto.telefono, processedMessage)
      return true
    } catch (error) {
      console.error(`Error enviando SMS (intento ${attempt}/${maxRetries + 1}):`, error)
      if (attempt <= maxRetries) {
        await new Promise(r => setTimeout(r, 1000 * attempt))
        return this.sendSMS(config, attempt + 1)
      }
      return false
    }
  }

  private async sendWhatsApp(config: any, attempt = 1): Promise<boolean> {
    const { message, maxRetries = 2 } = config
    const contacto = this.context.lead || this.context.estudiante

    if (!contacto?.telefono) return false

    if (!this.context.tenantId) {
      console.error('Error: No se proporcionó tenantId en el contexto de automatización')
      return false
    }

    const processedMessage = this.replaceVariables(message)

    try {
      await sendWhatsAppMessage(contacto.telefono, processedMessage, this.context.tenantId)
      return true
    } catch (error) {
      console.error(`Error enviando WhatsApp (intento ${attempt}/${maxRetries + 1}):`, error)
      if (attempt <= maxRetries) {
        await new Promise(r => setTimeout(r, 1000 * attempt))
        return this.sendWhatsApp(config, attempt + 1)
      }
      return false
    }
  }

  private async sendTelegram(config: any, attempt = 1): Promise<boolean> {
    const { message, chatId, maxRetries = 2 } = config
    const tenantId = this.context.tenantId

    if (!tenantId) {
      console.error('[Automation] No tenantId in context for sendTelegram')
      return false
    }

    const processedMessage = this.replaceVariables(message)

    try {
      const creds = await loadTelegramCredentials(tenantId)
      
      const finalChatId = chatId || creds?.admin_chat_id
      
      if (!finalChatId) {
        console.error('[Automation] No chatId provided for sendTelegram')
        return false
      }

      await sendTelegramMessage(finalChatId, processedMessage, creds?.bot_token)
      return true
    } catch (error) {
      console.error(`Error enviando Telegram (intento ${attempt}/${maxRetries + 1}):`, error)
      if (attempt <= maxRetries) {
        await new Promise(r => setTimeout(r, 1000 * attempt))
        return this.sendTelegram(config, attempt + 1)
      }
      return false
    }
  }

  private async updateLead(config: any): Promise<boolean> {
    const { newStatus, updateData } = config
    const leadId = this.context.leadId

    if (!leadId) return false

    const dataToUpdate: any = { ...updateData }
    if (newStatus) {
      dataToUpdate.estado = newStatus
    }

    if (Object.keys(dataToUpdate).length === 0) return true

    await prisma.lead.update({
      where: { id: leadId },
      data: {
        ...dataToUpdate,
        fechaUltimaActividad: new Date(),
      },
    })

    return true
  }

  private async updateEstudiante(config: any): Promise<boolean> {
    const { updateData } = config
    const estudianteId = this.context.estudianteId

    if (!estudianteId || !updateData) return false

    await prisma.estudiante.update({
      where: { id: estudianteId },
      data: updateData,
    })

    return true
  }

  private async assignTag(config: any): Promise<boolean> {
    const { tag } = config
    const leadId = this.context.leadId

    if (!leadId || !tag) return false

    // Actualizar tags del lead (agregar a array o string separado por comas)
    const lead = await prisma.lead.findUnique({ where: { id: leadId } })
    if (!lead) return false

    const currentTags = lead.tags || ''
    const tagsArray = currentTags.split(',').filter(t => t.trim())

    if (!tagsArray.includes(tag)) {
      tagsArray.push(tag)
      await prisma.lead.update({
        where: { id: leadId },
        data: {
          tags: tagsArray.join(','),
          fechaUltimaActividad: new Date(),
        },
      })
    }

    return true
  }

  private async removeTag(config: any): Promise<boolean> {
    const { tag } = config
    const leadId = this.context.leadId

    if (!leadId || !tag) return false

    const lead = await prisma.lead.findUnique({ where: { id: leadId } })
    if (!lead) return false

    const currentTags = lead.tags || ''
    const tagsArray = currentTags.split(',').filter(t => t.trim() && t !== tag)

    await prisma.lead.update({
      where: { id: leadId },
      data: {
        tags: tagsArray.join(','),
        fechaUltimaActividad: new Date(),
      },
    })

    return true
  }

  private async archiveLead(config: any): Promise<boolean> {
    const leadId = this.context.leadId
    if (!leadId) return false

    await prisma.lead.update({
      where: { id: leadId },
      data: {
        estado: 'archivado',
        fechaUltimaActividad: new Date(),
      },
    })

    return true
  }

  private async duplicateLead(config: any): Promise<boolean> {
    const leadId = this.context.leadId
    if (!leadId) return false

    const lead = await prisma.lead.findUnique({ where: { id: leadId } })
    if (!lead) return false

    // Crear copia del lead
    await prisma.lead.create({
      data: {
        nombre: `${lead.nombre} (Copia)`,
        email: lead.email,
        telefono: lead.telefono,
        empresa: lead.empresa,
        cargo: lead.cargo,
        ubicacion: lead.ubicacion,
        linkedin: lead.linkedin,
        estado: 'nuevo',
        fuente: lead.fuente,
        tags: lead.tags,
        scoreValue: lead.scoreValue || 0,
        tenantId: lead.tenantId,
      },
    })

    return true
  }

  private async calculateAutoScore(config: any): Promise<boolean> {
    const leadId = this.context.leadId
    if (!leadId) return false

    const lead = await prisma.lead.findUnique({
      where: { id: leadId },
      include: {
        citas: true,
        interacciones: true,
      },
    })
    if (!lead) return false

    // Calcular score automático basado en:
    let score = 0

    // 1. Email válido: +10
    if (lead.email && lead.email.includes('@')) score += 10

    // 2. Teléfono válido: +10
    if (lead.telefono) score += 10

    // 3. Empresa definida: +15
    if (lead.empresa) score += 15

    // 4. Cargo definido: +10
    if (lead.cargo) score += 10

    // 5. Interacciones recientes: +5 por interacción (max 25)
    const recentInteractions = lead.interacciones?.filter((i: any) => {
      const daysSince = (Date.now() - new Date(i.fechaCreacion).getTime()) / (1000 * 60 * 60 * 24)
      return daysSince <= 30
    }).length || 0
    score += Math.min(recentInteractions * 5, 25)

    // 6. Citas agendadas: +15 por cita (max 30)
    const citasCount = lead.citas?.length || 0
    score += Math.min(citasCount * 15, 30)

    // Limitar entre 0 y 100
    score = Math.max(0, Math.min(100, score))

    await prisma.lead.update({
      where: { id: leadId },
      data: { scoreValue: score },
    })

    return true
  }

  private async createTask(config: any): Promise<boolean> {
    const { titulo, descripcion, fechaVencimiento, prioridad, asignadoA } = config
    const leadId = this.context.leadId
    const tenantId = this.context.lead?.tenantId

    if (!tenantId) return false

    const taskData: any = {
      titulo: titulo || 'Tarea desde automatización',
      descripcion,
      estado: 'pendiente',
      prioridad: prioridad || 'media',
      leadId,
      asignadoA,
      tenantId,
    }

    if (fechaVencimiento) {
      taskData.fechaVencimiento = new Date(fechaVencimiento)
    }

    await prisma.task.create({
      data: taskData,
    })

    return true
  }

  private async sendNotification(config: any): Promise<boolean> {
    const { message, userId, priority = 'normal' } = config
    const tenantId = this.context.tenantId || this.context.lead?.tenantId

    if (!tenantId) return false

    const processedMessage = this.replaceVariables(message)
    const context = createSystemContext(tenantId)

    try {
      await notificationService.send(
        { 
          type: 'user', 
          id: userId || 'admin' 
        },
        { 
          title: 'Notificación de Automatización',
          body: processedMessage 
        },
        { 
          channel: 'in_app', // Centralizado en notificationService
          priority: priority as any 
        },
        context
      )
      return true
    } catch (error) {
      console.error('Error en sendNotification de automatización:', error)
      return false
    }
  }

  private async assignLeadToUser(config: any): Promise<boolean> {
    const { userId } = config
    const leadId = this.context.leadId

    if (!leadId || !userId) return false

    await prisma.lead.update({
      where: { id: leadId },
      data: {
        asignadoA: userId,
        fechaUltimaActividad: new Date(),
      },
    })

    // Crear notificación para el usuario asignado
    await this.sendNotification({
      message: `Se te ha asignado un nuevo lead: {nombre}`,
      userId,
    })

    return true
  }

  private async updateLeadScore(config: any): Promise<boolean> {
    const { operation, value } = config // operation: 'set', 'add', 'subtract'
    const leadId = this.context.leadId

    if (!leadId) return false

    const lead = await prisma.lead.findUnique({ where: { id: leadId } })
    if (!lead) return false

    let newScore = lead.scoreValue || 0

    switch (operation) {
      case 'set':
        newScore = value
        break
      case 'add':
        newScore += value
        break
      case 'subtract':
        newScore -= value
        break
    }

    // Asegurar que el score esté entre 0 y 100
    newScore = Math.max(0, Math.min(100, newScore))

    await prisma.lead.update({
      where: { id: leadId },
      data: { scoreValue: newScore },
    })

    return true
  }

  private async createDeal(config: any): Promise<boolean> {
    const { titulo, valor, moneda, etapa, probabilidad } = config
    const leadId = this.context.leadId
    const tenantId = this.context.lead?.tenantId

    if (!tenantId) return false

    await prisma.deal.create({
      data: {
        titulo: titulo || `Deal - ${this.context.lead?.nombre || 'Sin nombre'}`,
        valor: parseFloat(valor) || 0,
        moneda: moneda || 'EUR',
        etapa: etapa || 'calificacion',
        probabilidad: probabilidad || 25,
        leadId,
        tenantId,
        fechaCreacion: new Date(),
        estado: 'activo',
      },
    })

    return true
  }

  private async enrollInCourse(config: any): Promise<boolean> {
    const { cursoId } = config
    const estudianteId = this.context.estudianteId

    if (!estudianteId || !cursoId) return false

    // Verificar si ya está inscrito
    const existingEnrollment = await prisma.inscripcion.findFirst({
      where: {
        estudianteId,
        cursoId,
      },
    })

    if (existingEnrollment) return true

    await prisma.inscripcion.create({
      data: {
        estudianteId,
        cursoId,
        fechaInscripcion: new Date(),
        estado: 'activo',
        progresoPorcentaje: 0,
      },
    })

    return true
  }

  private async sendCertificate(config: any): Promise<boolean> {
    const estudianteId = this.context.estudianteId
    const cursoId = this.context.cursoId

    if (!estudianteId || !cursoId) return false

    const estudiante = await prisma.estudiante.findUnique({
      where: { id: estudianteId },
    })

    if (!estudiante?.email) return false

    // Generar certificado
    const codigoUnico = `CERT-${Date.now()}-${estudianteId}`

    await prisma.certificado.create({
      data: {
        codigoUnico,
        estudianteId,
        cursoId,
        fechaEmision: new Date(),
      },
    })

    // Enviar email con el certificado
    await sendResendEmail({
      to: estudiante.email,
      subject: '¡Felicitaciones! Tu certificado está listo',
      html: `
        <h1>¡Felicitaciones por completar el curso!</h1>
        <p>Tu certificado ha sido generado.</p>
        <p>Código de verificación: <strong>${codigoUnico}</strong></p>
        <a href="${process.env.NEXT_PUBLIC_APP_URL}/certificados/verificar/${codigoUnico}">Ver Certificado</a>
      `,
    })

    return true
  }

  private async createAppointment(config: any): Promise<boolean> {
    const { titulo, descripcion, fechaHora, duracion, servicioId } = config
    const leadId = this.context.leadId
    const tenantId = this.context.lead?.tenantId

    if (!tenantId || !leadId || !servicioId) return false

    await prisma.cita.create({
      data: {
        titulo: titulo || 'Cita desde automatización',
        descripcion,
        fechaHora: new Date(fechaHora),
        duracion: duracion || 60,
        estado: 'pendiente',
        leadId,
        servicioId,
        tenantId,
      },
    })

    return true
  }

  private async addToCampaign(config: any): Promise<boolean> {
    const { campanaId } = config
    const leadId = this.context.leadId

    if (!leadId || !campanaId) return false

    // Verificar si ya está en la campaña
    const existing = await prisma.campaignLead.findFirst({
      where: {
        campanaId,
        leadId,
      },
    })

    if (existing) return true

    await prisma.campaignLead.create({
      data: {
        campanaId,
        leadId,
        estado: 'activo',
        fechaAgregado: new Date(),
      },
    })

    return true
  }

  private async removeFromCampaign(config: any): Promise<boolean> {
    const { campanaId } = config
    const leadId = this.context.leadId

    if (!leadId || !campanaId) return false

    await prisma.campaignLead.deleteMany({
      where: {
        campanaId,
        leadId,
      },
    })

    return true
  }

  private async sendWebhook(config: any): Promise<boolean> {
    const { url, method = 'POST', headers = {}, includeLeadData = true, includeFiscalConfig = true } = config

    if (!url) return false

    try {
      const payload: any = {
        event: 'automation_triggered',
        timestamp: new Date().toISOString(),
        automation: {
          id: this.automationId,
          executionId: this.executionId,
        },
      }

      if (includeLeadData && this.context.lead) {
        payload.lead = {
          id: this.context.lead.id,
          nombre: this.context.lead.nombre,
          email: this.context.lead.email,
          telefono: this.context.lead.telefono,
          estado: this.context.lead.estado,
          score: this.context.lead.scoreValue,
          tags: this.context.lead.tags,
        }
      }

      // Incluir configuración fiscal dinámica
      if (includeFiscalConfig && this.context.tenantId) {
        try {
          const fiscalConfig = await getFiscalConfig(this.context.tenantId, {
            leadId: this.context.leadId,
          })
          payload.fiscal_config = getFiscalConfigForWebhook(fiscalConfig)
        } catch (fiscalError) {
          console.warn('No se pudo obtener configuración fiscal para webhook:', fiscalError)
        }
      }

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
        body: JSON.stringify(payload),
      })

      return response.ok
    } catch (error) {
      console.error('Error enviando webhook:', error)
      return false
    }
  }

  /**
   * Ejecuta un workflow externo via template
   * El workflow se provisiona automáticamente para el tenant si no existe
   */
  private async executeExternalWorkflow(config: any): Promise<boolean> {
    const { templateId, payload = {}, timeout = 30000, retryCount = 3 } = config

    if (!templateId) {
      console.error('[Automation] templateId no proporcionado para ejecutar_workflow')
      return false
    }

    if (!this.context.tenantId) {
      console.error('[Automation] tenantId no proporcionado para ejecutar_workflow')
      return false
    }

    const startTime = Date.now()

    try {
      // Importar el servicio de templates
      const { workflowTemplateService } = await import('./workflow-template-service')

      // Preparar payload con datos del contexto
      const enrichedPayload = {
        ...payload,
        lead: this.context.lead ? {
          id: this.context.lead.id,
          nombre: this.context.lead.nombre,
          email: this.context.lead.email,
          telefono: this.context.lead.telefono,
          estado: this.context.lead.estado,
          score: this.context.lead.scoreValue,
          tags: this.context.lead.tags,
        } : undefined,
        estudiante: this.context.estudiante ? {
          id: this.context.estudiante.id,
          nombre: this.context.estudiante.nombre,
          email: this.context.estudiante.email,
        } : undefined,
        cita: this.context.cita ? {
          id: this.context.cita.id,
          titulo: this.context.cita.titulo,
          fechaHora: this.context.cita.fechaHora,
          estado: this.context.cita.estado,
        } : undefined,
      }

      // Ejecutar via workflow template service (provisiona automáticamente si es necesario)
      const result = await workflowTemplateService.executeWorkflow(
        this.context.tenantId,
        templateId,
        enrichedPayload,
        {
          timeout,
          automationId: this.automationId,
          executionId: this.executionId,
        }
      )

      const duration = Date.now() - startTime

      // Registrar en log
      await prisma.automationExecutionLog.create({
        data: {
          executionId: this.executionId,
          nodeId: 'external_workflow',
          nodeType: 'ejecutar_workflow',
          status: result.success ? 'success' : 'error',
          message: result.success ? 'Automatización ejecutada correctamente' : result.error,
          data: {
            templateId,
            response: result.response,
          },
          externalWorkflowId: templateId,
          externalStatus: result.success ? 'completed' : 'failed',
          externalResponse: result.response,
          duration,
        },
      })

      return result.success
    } catch (error: any) {
      console.error('[Automation] Error ejecutando automatización:', error)
      
      await prisma.automationExecutionLog.create({
        data: {
          executionId: this.executionId,
          nodeId: 'external_workflow',
          nodeType: 'ejecutar_workflow',
          status: 'error',
          message: error.message,
          externalWorkflowId: templateId,
          externalStatus: 'error',
          duration: Date.now() - startTime,
        },
      })
      
      return false
    }
  }

  /**
   * Envía webhook seguro con firma HMAC
   */
  private async sendSecureWebhook(config: any): Promise<boolean> {
    const { 
      url, 
      method = 'POST', 
      headers = {}, 
      payload = {}, 
      secret,
      timeout = 30000,
      retryCount = 3 
    } = config

    if (!url) return false

    const startTime = Date.now()

    try {
      // Preparar payload con datos del contexto
      const fullPayload = {
        event: 'volkern_automation',
        timestamp: new Date().toISOString(),
        automation: {
          id: this.automationId,
          executionId: this.executionId,
        },
        tenantId: this.context.tenantId,
        data: {
          ...payload,
          lead: this.context.lead ? {
            id: this.context.lead.id,
            nombre: this.context.lead.nombre,
            email: this.context.lead.email,
            telefono: this.context.lead.telefono,
          } : undefined,
        },
      }

      const bodyString = JSON.stringify(fullPayload)
      
      // Generar firma HMAC si hay secret
      const requestHeaders: Record<string, string> = {
        'Content-Type': 'application/json',
        ...headers,
      }

      if (secret) {
        const crypto = await import('crypto')
        const signature = crypto
          .createHmac('sha256', secret)
          .update(bodyString)
          .digest('hex')
        requestHeaders['X-Volkern-Signature'] = signature
        requestHeaders['X-Volkern-Timestamp'] = new Date().toISOString()
      }

      // Ejecutar con timeout
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), timeout)

      let lastError: Error | null = null
      const retries = retryCount || 0

      for (let attempt = 0; attempt <= retries; attempt++) {
        try {
          if (attempt > 0) {
            await new Promise(r => setTimeout(r, 1000 * attempt)) // Backoff
          }

          const response = await fetch(url, {
            method,
            headers: requestHeaders,
            body: bodyString,
            signal: controller.signal,
          })

          clearTimeout(timeoutId)

          if (response.ok) {
            return true
          }

          lastError = new Error(`HTTP ${response.status}: ${response.statusText}`)
        } catch (error: any) {
          lastError = error
        }
      }

      clearTimeout(timeoutId)
      throw lastError || new Error('Unknown error')
    } catch (error: any) {
      console.error('[Automation] Error enviando webhook seguro:', error)
      return false
    }
  }

  private async generateInvoice(config: any): Promise<boolean> {
    const { amount, currency = 'EUR', description, items = [] } = config
    const tenantId = this.context.tenantId

    if (!tenantId) return false

    try {
      await InvoicingService.createInvoice({
        tenantId,
        leadId: this.context.leadId,
        contactId: this.context.contactId,
        amount: amount || 0,
        currency,
        description: description || 'Factura generada desde automatización',
        items: items.length > 0 ? items : [{ name: 'Servicio', quantity: 1, price: amount || 0 }]
      })
      return true
    } catch (error) {
      console.error('Error generando factura en automatización:', error)
      return false
    }
  }

  private async sendGoCardlessMandate(config: any): Promise<boolean> {
    const { channel = 'email' } = config
    const tenantId = this.context.tenantId
    const leadId = this.context.leadId
    const contactId = this.context.contactId

    if (!tenantId) return false

    try {
      const { authorizationUrl } = await InvoicingService.getOrCreateGoCardlessMandateLink(tenantId, leadId, contactId)
      
      const message = `Hola, para procesar tus pagos por domiciliación bancaria, por favor autoriza el mandato aquí: ${authorizationUrl}`
      
      if (channel === 'whatsapp') {
        return await this.sendWhatsApp({ message })
      } else {
        return await this.sendEmail({ 
          subject: 'Autorización de Domiciliación Bancaria',
          message: `<p>${message}</p>`
        })
      }
    } catch (error) {
      console.error('Error enviando mandato GoCardless en automatización:', error)
      return false
    }
  }

  private async pauseAutomation(config: any): Promise<boolean> {
    const { automationId } = config

    if (!automationId) return false

    const automation = await prisma.automation.findFirst({
      where: { id: automationId, tenantId: this.context.tenantId },
    })

    if (!automation) return false

    await prisma.automation.update({
      where: { id: automationId },
      data: { activo: false },
    })

    return true
  }

  private async activateAutomation(config: any): Promise<boolean> {
    const { automationId } = config

    if (!automationId) return false

    const automation = await prisma.automation.findFirst({
      where: { id: automationId, tenantId: this.context.tenantId },
    })

    if (!automation) return false

    await prisma.automation.update({
      where: { id: automationId },
      data: { activo: true },
    })

    return true
  }

  private replaceVariables(text: string): string {
    if (!text) return ''

    const lead = this.context.lead
    const estudiante = this.context.estudiante
    const curso = this.context.curso
    const cita = this.context.cita

    let processed = text

    // Variables de lead
    if (lead) {
      const now = new Date();
      const fechaHoy = now.toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' });

      const vars: Record<string, string> = {
        '{nombre}': lead.nombre || '',
        '{{nombre}}': lead.nombre || '',
        '{lead.nombre}': lead.nombre || '',
        '{{lead.nombre}}': lead.nombre || '',
        '{email}': lead.email || '',
        '{{email}}': lead.email || '',
        '{lead.email}': lead.email || '',
        '{{lead.email}}': lead.email || '',
        '{telefono}': lead.telefono || '',
        '{{telefono}}': lead.telefono || '',
        '{lead.telefono}': lead.telefono || '',
        '{{lead.telefono}}': lead.telefono || '',
        '{lead.estado}': lead.estado || '',
        '{{lead.estado}}': lead.estado || '',
        '{empresa}': lead.empresa || '',
        '{{empresa}}': lead.empresa || '',
        '{id_fiscal}': lead.perfilFiscal?.idFiscal || '',
        '{{id_fiscal}}': lead.perfilFiscal?.idFiscal || '',
        '{fecha_hoy}': fechaHoy,
        '{{fecha_hoy}}': fechaHoy,
      }

      for (const [key, value] of Object.entries(vars)) {
        processed = processed.split(key).join(value)
      }
    }

    // Variables de estudiante
    if (estudiante) {
      const vars: Record<string, string> = {
        '{nombre}': estudiante.nombre || '',
        '{{nombre}}': estudiante.nombre || '',
        '{estudiante.nombre}': estudiante.nombre || '',
        '{{estudiante.nombre}}': estudiante.nombre || '',
        '{email}': estudiante.email || '',
        '{{email}}': estudiante.email || '',
        '{estudiante.email}': estudiante.email || '',
        '{{estudiante.email}}': estudiante.email || '',
        '{telefono}': estudiante.telefono || '',
        '{{telefono}}': estudiante.telefono || '',
        '{estudiante.telefono}': estudiante.telefono || '',
        '{{estudiante.telefono}}': estudiante.telefono || '',
      }

      for (const [key, value] of Object.entries(vars)) {
        processed = processed.split(key).join(value)
      }
    }

    // Variables de curso
    if (curso) {
      const vars: Record<string, string> = {
        '{curso.titulo}': curso.titulo || '',
        '{{curso.titulo}}': curso.titulo || '',
        '{curso.descripcion}': curso.descripcion || '',
        '{{curso.descripcion}}': curso.descripcion || '',
      }

      for (const [key, value] of Object.entries(vars)) {
        processed = processed.split(key).join(value)
      }
    }

    // Variables de cita
    if (cita) {
      const vars: Record<string, string> = {
        '{cita.fechaHora}': cita.fechaHora ? new Date(cita.fechaHora).toLocaleString('es-MX') : '',
        '{{cita.fechaHora}}': cita.fechaHora ? new Date(cita.fechaHora).toLocaleString('es-MX') : '',
        '{cita.servicio}': cita.servicio?.nombre || '',
        '{{cita.servicio}}': cita.servicio?.nombre || '',
      }

      for (const [key, value] of Object.entries(vars)) {
        processed = processed.split(key).join(value)
      }
    }

    return processed
  }

  private async log(nodeId: string, nodeType: string, status: string, message: string) {
    await prisma.automationExecutionLog.create({
      data: {
        executionId: this.executionId,
        nodeId,
        nodeType,
        status,
        message,
      },
    })
  }

  private async logError(message: string) {
    await prisma.automationExecution.update({
      where: { id: this.executionId },
      data: {
        estado: 'error',
        errorMessage: message,
        fechaFin: new Date(),
      },
    })
  }

  // ============== FASE 1: ACCIONES DE INVENTARIO ==============

  private async notifyLowStock(config: any): Promise<boolean> {
    const { itemId, itemNombre, cantidadActual, cantidadMinima, almacenNombre } = config
    const message = `⚠️ *Alerta de Stock Bajo*\n\n📦 *Producto:* ${itemNombre || this.context.itemNombre}\n📊 *Stock Actual:* ${cantidadActual || this.context.cantidadActual}\n📉 *Mínimo:* ${cantidadMinima || this.context.cantidadMinima}\n🏭 *Almacén:* ${almacenNombre || this.context.almacenNombre || 'Principal'}`
    
    const { notifyByTelegram, notifyByEmail } = await import('@/lib/skills/notification-layer')
    const context = createSystemContext(this.context.tenantId)
    
    if (config.enviarTelegram) {
      notifyByTelegram(message, context).catch(() => {})
    }
    if (config.enviarEmail && this.context.userEmail) {
      notifyByEmail(this.context.userEmail, 'Alerta de Stock Bajo', message, context).catch(() => {})
    }
    
    await this.log('notify_low_stock', 'action', 'success', `Notificación de stock bajo enviada para ${itemNombre || this.context.itemNombre}`)
    return true
  }

  private async updateInventory(config: any): Promise<boolean> {
    const { itemId, cantidad, tipo, motivo } = config
    const tenantClient = await getTenantDb(this.context.tenantId)
    
    const updateData: any = {}
    if (tipo === 'aumentar') {
      updateData.cantidad = { increment: cantidad }
    } else if (tipo === 'disminuir') {
      updateData.cantidad = { decrement: cantidad }
    } else if (tipo === 'set') {
      updateData.cantidad = cantidad
    }
    
    if (motivo) updateData.ultimaActualizacion = motivo
    
    await tenantClient.inventarioItem.update({
      where: { id: itemId || this.context.itemId },
      data: updateData,
    })
    
    await this.log('update_inventory', 'action', 'success', `Inventario actualizado: ${tipo} ${cantidad}`)
    return true
  }

  private async createPurchaseOrder(config: any): Promise<boolean> {
    const { proveedorId, items, notas } = config
    const tenantClient = await getTenantDb(this.context.tenantId)
    
    const order = await tenantClient.compra.create({
      data: {
        tenantId: this.context.tenantId,
        proveedorId,
        estado: 'pendiente',
        notas,
        fechaEntrega: config.fechaEntrega,
        items: {
          create: items.map((item: any) => ({
            itemId: item.itemId,
            cantidad: item.cantidad,
            precioUnitario: item.precio,
          })),
        },
      },
    })
    
    await this.log('create_purchase_order', 'action', 'success', `Orden de compra ${order.id} creada`)
    return true
  }

  private async adjustStock(config: any): Promise<boolean> {
    const { itemId, cantidad, tipo, motivo } = config
    const tenantClient = await getTenantDb(this.context.tenantId)
    
    const adjustment = await tenantClient.inventarioMovimiento.create({
      data: {
        tenantId: this.context.tenantId,
        itemId: itemId || this.context.itemId,
        tipo: tipo || 'ajuste',
        cantidad,
        motivo: motivo || 'Ajuste manual',
        usuarioId: this.context.userId,
      },
    })
    
    await this.log('adjust_stock', 'action', 'success', `Ajuste de stock registrado: ${cantidad}`)
    return true
  }

  // ============== FASE 2: PRODUCCIÓN ==============

  private async createProductionOrder(config: any): Promise<boolean> {
    const { productoId, cantidad, prioridad, fechaEntrega } = config
    const tenantClient = await getTenantDb(this.context.tenantId)
    
    const order = await tenantClient.produccionOrden.create({
      data: {
        tenantId: this.context.tenantId,
        productoId,
        cantidad: cantidad || 1,
        prioridad: prioridad || 'normal',
        estado: 'pendiente',
        fechaInicio: new Date(),
        fechaEntrega: fechaEntrega,
      },
    })
    
    await this.log('create_production_order', 'action', 'success', `Orden de producción ${order.id} creada`)
    return true
  }

  private async updateProductionOrderStatus(config: any): Promise<boolean> {
    const { orderId, estado, notas } = config
    const tenantClient = await getTenantDb(this.context.tenantId)
    
    await tenantClient.produccionOrden.update({
      where: { id: orderId || this.context.productionOrderId },
      data: {
        estado,
        notas,
        fechaFin: estado === 'completada' ? new Date() : undefined,
      },
    })
    
    await this.log('update_production_status', 'action', 'success', `Estado de producción actualizado: ${estado}`)
    return true
  }

  private async notifyProduction(config: any): Promise<boolean> {
    const { orderId, message, tipo } = config
    const { notifyByTelegram } = await import('@/lib/skills/notification-layer')
    const context = createSystemContext(this.context.tenantId)
    
    const msg = message || `📦 *Actualización de Producción*\n\nEstado: ${tipo || 'Actualización'}`
    notifyByTelegram(msg, context).catch(() => {})
    
    await this.log('notify_production', 'action', 'success', 'Notificación de producción enviada')
    return true
  }

  private async registerProduction(config: any): Promise<boolean> {
    const { orderId, cantidadProducida, calidad, notas } = config
    const tenantClient = await getTenantDb(this.context.tenantId)
    
    await tenantClient.produccionRegistro.create({
      data: {
        tenantId: this.context.tenantId,
        ordenId: orderId || this.context.productionOrderId,
        cantidad: cantidadProducida,
        calidad,
        notas,
        fecha: new Date(),
      },
    })
    
    await this.log('register_production', 'action', 'success', `Producción registrada: ${cantidadProducida} unidades`)
    return true
  }

  // ============== FASE 3: SOPORTE ==============

  private async createSupportTicket(config: any): Promise<boolean> {
    const { titulo, descripcion, prioridad, categoria } = config
    const tenantClient = await getTenantDb(this.context.tenantId)
    
    const ticket = await tenantClient.soporteTicket.create({
      data: {
        tenantId: this.context.tenantId,
        titulo,
        descripcion,
        prioridad: prioridad || 'media',
        categoria: categoria || 'general',
        estado: 'abierto',
        solicitanteId: this.context.leadId || this.context.userId,
      },
    })
    
    await this.log('create_support_ticket', 'action', 'success', `Ticket ${ticket.id} creado`)
    return true
  }

  private async assignTicket(config: any): Promise<boolean> {
    const { ticketId, asignadoA } = config
    const tenantClient = await getTenantDb(this.context.tenantId)
    
    await tenantClient.soporteTicket.update({
      where: { id: ticketId || this.context.ticketId },
      data: {
        asignadoA,
        estado: 'asignado',
      },
    })
    
    await this.log('assign_ticket', 'action', 'success', `Ticket asignado a ${asignadoA}`)
    return true
  }

  private async escalateTicket(config: any): Promise<boolean> {
    const { ticketId, nivel, motivo } = config
    const tenantClient = await getTenantDb(this.context.tenantId)
    
    await tenantClient.soporteTicket.update({
      where: { id: ticketId || this.context.ticketId },
      data: {
        nivelEscalacion: nivel,
        estado: 'escalado',
        notas: motivo,
      },
    })
    
    await this.log('escalate_ticket', 'action', 'success', `Ticket escalado a nivel ${nivel}`)
    return true
  }

  private async notifySLA(config: any): Promise<boolean> {
    const { ticketId, tipoAlerta } = config
    const tenantClient = await getTenantDb(this.context.tenantId)
    
    const ticket = await tenantClient.soporteTicket.findUnique({
      where: { id: ticketId || this.context.ticketId },
      include: { asignadoA: true },
    })
    
    if (ticket) {
      const { notifyByTelegram, notifyByEmail } = await import('@/lib/skills/notification-layer')
      const context = createSystemContext(this.context.tenantId)
      const message = `⚠️ *Alerta SLA ${tipoAlerta}*\n\nTicket: ${ticket.titulo}\nAsignado a: ${ticket.asignadoA?.nombre || 'Sin asignar'}`
      
      notifyByTelegram(message, context).catch(() => {})
      if (ticket.asignadoA?.email) {
        notifyByEmail(ticket.asignadoA.email, 'Alerta SLA', message, context).catch(() => {})
      }
    }
    
    await this.log('notify_sla', 'action', 'success', 'Alerta SLA enviada')
    return true
  }

  private async closeTicket(config: any): Promise<boolean> {
    const { ticketId, solucion, satisfaccion } = config
    const tenantClient = await getTenantDb(this.context.tenantId)
    
    await tenantClient.soporteTicket.update({
      where: { id: ticketId || this.context.ticketId },
      data: {
        estado: 'cerrado',
        solucion,
        satisfaccionCliente: satisfaccion,
        fechaCierre: new Date(),
      },
    })
    
    await this.log('close_ticket', 'action', 'success', 'Ticket cerrado')
    return true
  }

  private async createTaskFromTicket(config: any): Promise<boolean> {
    const { ticketId, titulo, asignadoA, fechaVencimiento } = config
    const tenantClient = await getTenantDb(this.context.tenantId)
    
    const ticket = await tenantClient.soporteTicket.findUnique({
      where: { id: ticketId || this.context.ticketId },
    })
    
    await tenantClient.tarea.create({
      data: {
        tenantId: this.context.tenantId,
        titulo: titulo || `Tarea desde ticket: ${ticket?.titulo}`,
        descripcion: `Derivado del ticket ${ticketId || this.context.ticketId}`,
        asignadoA,
        fechaVencimiento,
        estado: 'pendiente',
        prioridad: ticket?.prioridad || 'media',
      },
    })
    
    await this.log('create_task_from_ticket', 'action', 'success', 'Tarea creada desde ticket')
    return true
  }

  // ============== FASE 4: MARKETING ==============

  private async createCampaign(config: any): Promise<boolean> {
    const { nombre, tipo, fechaInicio, fechaFin, presupuesto } = config
    const tenantClient = await getTenantDb(this.context.tenantId)
    
    const campaign = await tenantClient.campana.create({
      data: {
        tenantId: this.context.tenantId,
        nombre,
        tipo: tipo || 'email',
        estado: 'borrador',
        fechaInicio,
        fechaFin,
        presupuesto,
      },
    })
    
    await this.log('create_campaign', 'action', 'success', `Campaña ${campaign.id} creada`)
    return true
  }

  private async addContactToList(config: any): Promise<boolean> {
    const { listaId, leadId } = config
    const tenantClient = await getTenantDb(this.context.tenantId)
    
    await tenantClient.listaContacto.create({
      data: {
        tenantId: this.context.tenantId,
        listaId,
        leadId: leadId || this.context.leadId,
      },
    })
    
    await this.log('add_contact_to_list', 'action', 'success', 'Contacto agregado a lista')
    return true
  }

  private async removeContactFromList(config: any): Promise<boolean> {
    const { listaId, leadId } = config
    const tenantClient = await getTenantDb(this.context.tenantId)
    
    await tenantClient.listaContacto.deleteMany({
      where: {
        listaId,
        leadId: leadId || this.context.leadId,
      },
    })
    
    await this.log('remove_contact_from_list', 'action', 'success', 'Contacto removido de lista')
    return true
  }

  private async segmentAudience(config: any): Promise<boolean> {
    const { nombre, criterios } = config
    const tenantClient = await getTenantDb(this.context.tenantId)
    
    const whereClause: any = { tenantId: this.context.tenantId }
    
    if (criterios?.etiquetas?.length) {
      whereClause.etiquetas = { hasSome: criterios.etiquetas }
    }
    if (criterios?.origen) {
      whereClause.origen = criterios.origen
    }
    if (criterios?.fechaCreacionDespues) {
      whereClause.createdAt = { gte: new Date(criterios.fechaCreacionDespues) }
    }
    
    const leads = await tenantClient.lead.findMany({ where: whereClause, select: { id: true } })
    
    const lista = await tenantClient.lista.create({
      data: {
        tenantId: this.context.tenantId,
        nombre,
        tipo: 'segmento',
        criterio: JSON.stringify(criterios),
      },
    })
    
    await tenantClient.listaContacto.createMany({
      data: leads.map(l => ({
        tenantId: this.context.tenantId,
        listaId: lista.id,
        leadId: l.id,
      })),
    })
    
    await this.log('segment_audience', 'action', 'success', `Segmento creado con ${leads.length} contactos`)
    return true
  }

  private async scheduleSocialPost(config: any): Promise<boolean> {
    const { plataforma, contenido, fechaPublicacion, medios } = config
    const tenantClient = await getTenantDb(this.context.tenantId)
    
    await tenantClient.publicacionProgramada.create({
      data: {
        tenantId: this.context.tenantId,
        plataforma,
        contenido,
        fechaPublicacion: fechaPublicacion || new Date(),
        estado: 'programada',
        medios: medios || [],
      },
    })
    
    await this.log('schedule_social_post', 'action', 'success', `Publicación programada para ${plataforma}`)
    return true
  }

  private async publishSocialPost(config: any): Promise<boolean> {
    const { publicacionId } = config
    const tenantClient = await getTenantDb(this.context.tenantId)
    
    await tenantClient.publicacionProgramada.update({
      where: { id: publicacionId || this.context.publicacionId },
      data: {
        estado: 'publicada',
        fechaPublicacion: new Date(),
      },
    })
    
    await this.log('publish_social_post', 'action', 'success', 'Publicación social publicada')
    return true
  }

  private async sendFollowUp(config: any): Promise<boolean> {
    const { leadId, tipo, templateId } = config
    const tenantClient = await getTenantDb(this.context.tenantId)
    
    const lead = await tenantClient.lead.findUnique({
      where: { id: leadId || this.context.leadId },
    })
    
    if (lead?.email) {
      const { sendEmail } = await import('@/lib/resend-email')
      const subject = tipo === 'bienvenida' ? '¡Bienvenido!' : 'Seguimiento'
      const body = templateId || 'Gracias por tu interés. Te contactaremos pronto.'
      
      await sendEmail(lead.email, subject, body, this.context.tenantId)
    }
    
    await this.log('send_follow_up', 'action', 'success', `Follow-up enviado al lead`)
    return true
  }

  private async updateNurturing(config: any): Promise<boolean> {
    const { leadId, etapa, diasEnEtapa } = config
    const tenantClient = await getTenantDb(this.context.tenantId)
    
    await tenantClient.lead.update({
      where: { id: leadId || this.context.leadId },
      data: {
        etapaNurturing: etapa,
        diasEnEtapa: diasEnEtapa || 0,
      },
    })
    
    await this.log('update_nurturing', 'action', 'success', `Etapa de nurturing actualizada: ${etapa}`)
    return true
  }

  private async calculateEngagement(config: any): Promise<boolean> {
    const { leadId, periodo } = config
    const tenantClient = await getTenantDb(this.context.tenantId)
    
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - (periodo || 30))
    
    const actividades = await tenantClient.actividad.count({
      where: {
        leadId: leadId || this.context.leadId,
        createdAt: { gte: startDate },
      },
    })
    
    const engagement = Math.min(100, actividades * 10)
    
    await tenantClient.lead.update({
      where: { id: leadId || this.context.leadId },
      data: { puntuacionEngagement: engagement },
    })
    
    await this.log('calculate_engagement', 'action', 'success', `Engagement calculado: ${engagement}%`)
    return true
  }

  private async generateCampaignReport(config: any): Promise<boolean> {
    const { campaignId, tipoReporte } = config
    const tenantClient = await getTenantDb(this.context.tenantId)
    
    const campaign = await tenantClient.campana.findUnique({
      where: { id: campaignId || this.context.campaignId },
      include: { envios: true },
    })
    
    const totalEnviados = campaign?.envios.length || 0
    const abiertos = campaign?.envios.filter((e: any) => e.abierto).length || 0
    const clicks = campaign?.envios.filter((e: any) => e.clic).length || 0
    
    const reporte = {
      campaignId: campaign?.id,
      nombre: campaign?.nombre,
      totalEnviados,
      tasaApertura: totalEnviados > 0 ? (abiertos / totalEnviados) * 100 : 0,
      tasaClics: totalEnviados > 0 ? (clicks / totalEnviados) * 100 : 0,
      fecha: new Date(),
    }
    
    await tenantClient.reporteCampana.create({
      data: {
        tenantId: this.context.tenantId,
        campanaId: campaign?.id,
        tipo: tipoReporte || 'resumen',
        datos: JSON.stringify(reporte),
      },
    })
    
    await this.log('generate_campaign_report', 'action', 'success', 'Reporte de campaña generado')
    return true
  }

  private async sendMarketingEmail(config: any): Promise<boolean> {
    const { leadId, templateId, asunto, contenido } = config
    const tenantClient = await getTenantDb(this.context.tenantId)
    
    const lead = await tenantClient.lead.findUnique({
      where: { id: leadId || this.context.leadId },
    })
    
    if (lead?.email) {
      const { sendEmail } = await import('@/lib/resend-email')
      await sendEmail(lead.email, asunto || 'Información', contenido || 'Contenido del email marketing', this.context.tenantId)
      
      await tenantClient.campanaEnvio.create({
        data: {
          tenantId: this.context.tenantId,
          campanaId: this.context.campaignId,
          leadId: lead.id,
          estado: 'enviado',
          fechaEnvio: new Date(),
        },
      })
    }
    
    await this.log('send_marketing_email', 'action', 'success', 'Email marketing enviado')
    return true
  }

  private async createEmailSequence(config: any): Promise<boolean> {
    const { nombre, emails, intervaloDias } = config
    const tenantClient = await getTenantDb(this.context.tenantId)
    
    const secuencia = await tenantClient.secuenciaEmail.create({
      data: {
        tenantId: this.context.tenantId,
        nombre,
        intervaloDias: intervaloDias || 1,
        estado: 'activa',
        pasos: {
          create: emails.map((email: any, index: number) => ({
            orden: index + 1,
            asunto: email.asunto,
            contenido: email.contenido,
            diasDespues: index * (intervaloDias || 1),
          })),
        },
      },
    })
    
    await this.log('create_email_sequence', 'action', 'success', `Secuencia de email "${nombre}" creada`)
    return true
  }

  private async pauseEmailSequence(config: any): Promise<boolean> {
    const { secuenciaId } = config
    const tenantClient = await getTenantDb(this.context.tenantId)
    
    await tenantClient.secuenciaEmail.update({
      where: { id: secuenciaId || this.context.secuenciaId },
      data: { estado: 'pausada' },
    })
    
    await this.log('pause_email_sequence', 'action', 'success', 'Secuencia de email pausada')
    return true
  }

  // ============== ACADEMIA / LMS ==============

  private async sendOnboarding(config: any): Promise<boolean> {
    const { estudianteId, cursoId } = config
    const tenantClient = await getTenantDb(this.context.tenantId)
    
    const estudiante = await tenantClient.estudiante.findUnique({
      where: { id: estudianteId || this.context.estudianteId },
      include: { usuario: true },
    })
    
    if (estudiante?.usuario?.email) {
      const { sendEmail } = await import('@/lib/resend-email')
      const mensaje = `¡Bienvenido al curso! Estamos emocionados de tenerte. Comienza tu viaje de aprendizaje hoy.`
      await sendEmail(estudiante.usuario.email, '¡Bienvenido a tu nuevo curso!', mensaje, this.context.tenantId)
    }
    
    await this.log('send_onboarding', 'action', 'success', 'Onboarding de estudiante enviado')
    return true
  }

  private async createEvaluation(config: any): Promise<boolean> {
    const { estudianteId, cursoId, tipo, titulo } = config
    const tenantClient = await getTenantDb(this.context.tenantId)
    
    await tenantClient.evaluacion.create({
      data: {
        tenantId: this.context.tenantId,
        estudianteId: estudianteId || this.context.estudianteId,
        cursoId: cursoId || this.context.cursoId,
        tipo: tipo || 'examen',
        titulo: titulo || 'Evaluación',
        estado: 'pendiente',
      },
    })
    
    await this.log('create_evaluation', 'action', 'success', 'Evaluación creada')
    return true
  }

  private async sendSurvey(config: any): Promise<boolean> {
    const { inscripcionId, tipoEncuesta } = config
    const tenantClient = await getTenantDb(this.context.tenantId)
    
    const inscripcion = await tenantClient.inscripcion.findUnique({
      where: { id: inscripcionId || this.context.inscripcionId },
      include: { estudiante: { include: { usuario: true } } },
    })
    
    if (inscripcion?.estudiante?.usuario?.email) {
      const { sendEmail } = await import('@/lib/resend-email')
      const subject = tipoEncuesta === 'satisfaccion' ? 'Encuesta de Satisfacción' : 'Evaluación del Curso'
      const body = 'Tu opinión es importante. Por favor, toma unos minutos para completar esta encuesta.'
      await sendEmail(inscripcion.estudiante.usuario.email, subject, body, this.context.tenantId)
    }
    
    await this.log('send_survey', 'action', 'success', 'Encuesta enviada')
    return true
  }

  private async registerTraining(config: any): Promise<boolean> {
    const { estudianteId, cursoId, tipoParticipacion } = config
    const tenantClient = await getTenantDb(this.context.tenantId)
    
    await tenantClient.registroCapacitacion.create({
      data: {
        tenantId: this.context.tenantId,
        estudianteId: estudianteId || this.context.estudianteId,
        cursoId: cursoId || this.context.cursoId,
        tipo: tipoParticipacion || 'presencial',
        fecha: new Date(),
        asistencia: true,
      },
    })
    
    await this.log('register_training', 'action', 'success', 'Capacitación registrada')
    return true
  }

  private async notifyCertification(config: any): Promise<boolean> {
    const { estudianteId, cursoId } = config
    const tenantClient = await getTenantDb(this.context.tenantId)
    
    const inscripcion = await tenantClient.inscripcion.findFirst({
      where: {
        estudianteId: estudianteId || this.context.estudianteId,
        cursoId: cursoId || this.context.cursoId,
        estado: 'completada',
      },
    })
    
    if (inscripcion) {
      const { notifyByTelegram, sendEmail } = await import('@/lib/skills/notification-layer')
      const context = createSystemContext(this.context.tenantId)
      
      const message = `🎓 *¡Felicitaciones!*\n\nHas completado el curso y puedes descargar tu certificado.`
      notifyByTelegram(message, context).catch(() => {})
      
      const estudiante = await tenantClient.estudiante.findUnique({
        where: { id: estudianteId || this.context.estudianteId },
        include: { usuario: true },
      })
      
      if (estudiante?.usuario?.email) {
        await sendEmail(estudiante.usuario.email, '¡Felicidades por completar el curso!', message, this.context.tenantId)
      }
    }
    
    await this.log('notify_certification', 'action', 'success', 'Notificación de certificación enviada')
    return true
  }

  // ============== RECURSOS HUMANOS ==============

  private async updateEmployee(config: any): Promise<boolean> {
    const { employeeId, datos } = config
    const tenantClient = await getTenantDb(this.context.tenantId)
    
    await tenantClient.empleado.update({
      where: { id: employeeId || this.context.employeeId },
      data: datos,
    })
    
    await this.log('update_employee', 'action', 'success', 'Datos de empleado actualizados')
    return true
  }

  private async assignRole(config: any): Promise<boolean> {
    const { employeeId, rolId } = config
    const tenantClient = await getTenantDb(this.context.tenantId)
    
    await tenantClient.empleadoRol.create({
      data: {
        tenantId: this.context.tenantId,
        empleadoId: employeeId || this.context.employeeId,
        rolId,
        estado: 'activo',
      },
    })
    
    await this.log('assign_role', 'action', 'success', 'Rol asignado al empleado')
    return true
  }

  // ============== FINANZAS ==============

  private async generateInvoice(config: any): Promise<boolean> {
    const { invoiceId, tipo } = config
    const tenantClient = await getTenantDb(this.context.tenantId)
    
    const invoice = await tenantClient.factura.findUnique({
      where: { id: invoiceId || this.context.invoiceId },
    })
    
    if (invoice && tipo === 'pdf') {
      const { InvoicingService } = await import('@/lib/invoicing-service')
      const invoicingService = new InvoicingService(this.context.tenantId)
      await invoicingService.generarPDF(invoice.id)
    }
    
    await this.log('generate_invoice', 'action', 'success', `Factura ${invoice?.id} generada`)
    return true
  }

  private async registerExpense(config: any): Promise<boolean> {
    const { categoria, monto, descripcion, fecha } = config
    const tenantClient = await getTenantDb(this.context.tenantId)
    
    await tenantClient.gasto.create({
      data: {
        tenantId: this.context.tenantId,
        categoria,
        monto,
        descripcion,
        fecha: fecha || new Date(),
        estado: 'pendiente',
        usuarioId: this.context.userId,
      },
    })
    
    await this.log('register_expense', 'action', 'success', `Gasto registrado: ${monto}`)
    return true
  }

  private async approveExpense(config: any): Promise<boolean> {
    const { expenseId, approve } = config
    const tenantClient = await getTenantDb(this.context.tenantId)
    
    await tenantClient.gasto.update({
      where: { id: expenseId || this.context.expenseId },
      data: {
        estado: approve ? 'aprobado' : 'rechazado',
        fechaAprobacion: new Date(),
        aprobadorId: this.context.userId,
      },
    })
    
    await this.log('approve_expense', 'action', 'success', `Gasto ${approve ? 'aprobado' : 'rechazado'}`)
    return true
  }

  private async rejectExpense(config: any): Promise<boolean> {
    return this.approveExpense({ ...config, approve: false })
  }

  private async notifyPayment(config: any): Promise<boolean> {
    const { paymentId, tipoNotificacion } = config
    const tenantClient = await getTenantDb(this.context.tenantId)
    
    const pago = await tenantClient.pago.findUnique({
      where: { id: paymentId || this.context.paymentId },
      include: { contrato: { include: { lead: true } } },
    })
    
    if (pago) {
      const { notifyByTelegram } = await import('@/lib/skills/notification-layer')
      const context = createSystemContext(this.context.tenantId)
      
      const message = tipoNotificacion === 'recibo' 
        ? `💳 *Recibo de Pago*\n\nMonto: ${pago.monto} ${pago.moneda}\nConcepto: ${pago.concepto}`
        : `✅ *Pago Confirmado*\n\nMonto: ${pago.monto} ${pago.moneda}`
      
      notifyByTelegram(message, context).catch(() => {})
    }
    
    await this.log('notify_payment', 'action', 'success', 'Notificación de pago enviada')
    return true
  }

  private async createPayroll(config: any): Promise<boolean> {
    const { periodoInicio, periodoFin, empleados } = config
    const tenantClient = await getTenantDb(this.context.tenantId)
    
    const nomina = await tenantClient.nomina.create({
      data: {
        tenantId: this.context.tenantId,
        periodoInicio,
        periodoFin,
        estado: 'borrador',
        detalles: {
          create: empleados.map((emp: any) => ({
            empleadoId: emp.employeeId,
            diasTrabajados: emp.dias || 30,
            sueldoBase: emp.sueldo,
            bonificaciones: emp.bonificaciones || 0,
            deducciones: emp.deducciones || 0,
          })),
        },
      },
    })
    
    await this.log('create_payroll', 'action', 'success', `Nómina ${nomina.id} creada`)
    return true
  }

  private async notifyInvoiceOverdue(config: any): Promise<boolean> {
    const { invoiceId, diasVencido } = config
    const tenantClient = await getTenantDb(this.context.tenantId)
    
    const factura = await tenantClient.factura.findUnique({
      where: { id: invoiceId || this.context.invoiceId },
      include: { cliente: true },
    })
    
    if (factura?.cliente?.email) {
      const { sendEmail } = await import('@/lib/resend-email')
      const subject = `Factura vencida - ${diasVencido} días`
      const body = `Tu factura #${factura.numero} está vencida. Por favor, regulariza tu pago.`
      await sendEmail(factura.cliente.email, subject, body, this.context.tenantId)
    }
    
    await this.log('notify_invoice_overdue', 'action', 'success', 'Notificación de factura vencida enviada')
    return true
  }

  private async sendPaymentReminder(config: any): Promise<boolean> {
    const { paymentId, diasAntes } = config
    const tenantClient = await getTenantDb(this.context.tenantId)
    
    const pago = await tenantClient.pago.findUnique({
      where: { id: paymentId || this.context.paymentId },
      include: { contrato: { include: { lead: true } } },
    })
    
    if (pago?.contrato?.lead?.email) {
      const { sendEmail } = await import('@/lib/resend-email')
      const subject = `Recordatorio de pago - Vence en ${diasAntes} días`
      const body = `Te recordamos que tienes un pago pendiente de ${pago.monto} ${pago.moneda}.`
      await sendEmail(pago.contrato.lead.email, subject, body, this.context.tenantId)
    }
    
    await this.log('send_payment_reminder', 'action', 'success', 'Recordatorio de pago enviado')
    return true
  }

  private async adjustBudget(config: any): Promise<boolean> {
    const { budgetId, monto, tipo } = config
    const tenantClient = await getTenantDb(this.context.tenantId)
    
    const presupuesto = await presupuesto.findUnique({
      where: { id: budgetId || this.context.budgetId },
    })
    
    const nuevoMonto = tipo === 'aumentar' 
      ? (presupuesto?.monto || 0) + monto
      : (presupuesto?.monto || 0) - monto
    
    await tenantClient.presupuesto.update({
      where: { id: budgetId || this.context.budgetId },
      data: { monto: nuevoMonto },
    })
    
    await this.log('adjust_budget', 'action', 'success', `Presupuesto ajustado: ${tipo} ${monto}`)
    return true
  }

  private async generateFinancialReport(config: any): Promise<boolean> {
    const { tipo, periodoInicio, periodoFin } = config
    const tenantClient = await getTenantDb(this.context.tenantId)
    
    const ingresos = await tenantClient.pago.aggregate({
      where: {
        tenantId: this.context.tenantId,
        estado: 'completado',
        fechaPago: { gte: periodoInicio, lte: periodoFin },
      },
      _sum: { monto: true },
    })
    
    const gastos = await tenantClient.gasto.aggregate({
      where: {
        tenantId: this.context.tenantId,
        fecha: { gte: periodoInicio, lte: periodoFin },
      },
      _sum: { monto: true },
    })
    
    const reporte = {
      periodo: { inicio: periodoInicio, fin: periodoFin },
      ingresos: ingresos._sum.monto || 0,
      gastos: gastos._sum.monto || 0,
      balance: (ingresos._sum.monto || 0) - (gastos._sum.monto || 0),
      tipo,
      fechaGeneracion: new Date(),
    }
    
    await tenantClient.reporteFinanciero.create({
      data: {
        tenantId: this.context.tenantId,
        tipo,
        periodoInicio,
        periodoFin,
        datos: JSON.stringify(reporte),
      },
    })
    
    await this.log('generate_financial_report', 'action', 'success', 'Reporte financiero generado')
    return true
  }

  // ============== CALIDAD ==============

  private async createInspection(config: any): Promise<boolean> {
    const { area, tipo, criterios } = config
    const tenantClient = await getTenantDb(this.context.tenantId)
    
    await tenantClient.inspeccion.create({
      data: {
        tenantId: this.context.tenantId,
        area,
        tipo: tipo || 'rutina',
        estado: 'programada',
        fechaProgramada: new Date(),
        criterios: criterios || [],
      },
    })
    
    await this.log('create_inspection', 'action', 'success', `Inspección creada para ${area}`)
    return true
  }

  private async registerNonConformity(config: any): Promise<boolean> {
    const { inspeccionId, descripcion, severidad } = config
    const tenantClient = await getTenantDb(this.context.tenantId)
    
    await tenantClient.noConformidad.create({
      data: {
        tenantId: this.context.tenantId,
        inspeccionId: inspeccionId || this.context.inspeccionId,
        descripcion,
        severidad: severidad || 'media',
        estado: 'abierta',
        fechaDeteccion: new Date(),
      },
    })
    
    await this.log('register_non_conformity', 'action', 'success', 'No conformidad registrada')
    return true
  }

  private async closeNonConformity(config: any): Promise<boolean> {
    const { nonConformityId, solucion, eficacia } = config
    const tenantClient = await getTenantDb(this.context.tenantId)
    
    await tenantClient.noConformidad.update({
      where: { id: nonConformityId || this.context.nonConformityId },
      data: {
        estado: 'cerrada',
        solucion,
        eficaciaVerificacion: eficacia,
        fechaCierre: new Date(),
      },
    })
    
    await this.log('close_non_conformity', 'action', 'success', 'No conformidad cerrada')
    return true
  }

  private async notifyQualityAlert(config: any): Promise<boolean> {
    const { nonConformityId, tipoAlerta } = config
    const tenantClient = await getTenantDb(this.context.tenantId)
    
    const nc = await tenantClient.noConformidad.findUnique({
      where: { id: nonConformityId || this.context.nonConformityId },
    })
    
    const { notifyByTelegram } = await import('@/lib/skills/notification-layer')
    const context = createSystemContext(this.context.tenantId)
    
    const message = `🔴 *Alerta de Calidad*\n\nTipo: ${tipoAlerta || 'No Conformidad'}\nSeveridad: ${nc?.severidad}\nDescripción: ${nc?.descripcion}`
    notifyByTelegram(message, context).catch(() => {})
    
    await this.log('notify_quality_alert', 'action', 'success', 'Alerta de calidad enviada')
    return true
  }

  private async generateQualityReport(config: any): Promise<boolean> {
    const { tipo, periodo } = config
    const tenantClient = await getTenantDb(this.context.tenantId)
    
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - (periodo || 30))
    
    const inspecciones = await tenantClient.inspeccion.count({
      where: {
        tenantId: this.context.tenantId,
        createdAt: { gte: startDate },
      },
    })
    
    const noConformidades = await tenantClient.noConformidad.count({
      where: {
        tenantId: this.context.tenantId,
        createdAt: { gte: startDate },
      },
    })
    
    const reporte = {
      tipo: tipo || 'mensual',
      periodo: periodo || 30,
      inspeccionesRealizadas: inspecciones,
      noConformidadesDetectadas: noConformidades,
      tasaConformidad: inspecciones > 0 ? ((inspecciones - noConformidades) / inspecciones) * 100 : 0,
      fecha: new Date(),
    }
    
    await tenantClient.reporteCalidad.create({
      data: {
        tenantId: this.context.tenantId,
        tipo,
        datos: JSON.stringify(reporte),
      },
    })
    
    await this.log('generate_quality_report', 'action', 'success', 'Reporte de calidad generado')
    return true
  }

  // ============== MANTENIMIENTO ==============

  private async scheduleCalibration(config: any): Promise<boolean> {
    const { equipoId, frecuenciaDias, fechaInicio } = config
    const tenantClient = await getTenantDb(this.context.tenantId)
    
    await tenantClient.calibracionProgramada.create({
      data: {
        tenantId: this.context.tenantId,
        equipoId: equipoId || this.context.equipoId,
        frecuenciaDias: frecuenciaDias || 180,
        fechaUltimaCalibracion: new Date(),
        fechaProximaCalibracion: fechaInicio || new Date(Date.now() + (frecuenciaDias || 180) * 24 * 60 * 60 * 1000),
        estado: 'programada',
      },
    })
    
    await this.log('schedule_calibration', 'action', 'success', 'Calibración programada')
    return true
  }

  // ============== PROYECTOS ==============

  private async createProject(config: any): Promise<boolean> {
    const { nombre, descripcion, fechaInicio, fechaFin, presupuesto } = config
    const tenantClient = await getTenantDb(this.context.tenantId)
    
    const proyecto = await tenantClient.proyecto.create({
      data: {
        tenantId: this.context.tenantId,
        nombre,
        descripcion,
        fechaInicio: fechaInicio || new Date(),
        fechaFin,
        presupuesto,
        estado: 'planificacion',
      },
    })
    
    await this.log('create_project', 'action', 'success', `Proyecto "${nombre}" creado`)
    return true
  }

  private async notifyProjectTeam(config: any): Promise<boolean> {
    const { projectId, mensaje, tipoNotificacion } = config
    const tenantClient = await getTenantDb(this.context.tenantId)
    
    const proyecto = await tenantClient.proyecto.findUnique({
      where: { id: projectId || this.context.projectId },
      include: { miembros: { include: { usuario: true } } },
    })
    
    const { notifyByTelegram, sendEmail } = await import('@/lib/skills/notification-layer')
    const context = createSystemContext(this.context.tenantId)
    
    for (const miembro of proyecto?.miembros || []) {
      if (miembro.usuario?.email) {
        await sendEmail(miembro.usuario.email, `Actualización del proyecto: ${proyecto?.nombre}`, mensaje, this.context.tenantId)
      }
    }
    
    notifyByTelegram(mensaje, context).catch(() => {})
    
    await this.log('notify_project_team', 'action', 'success', 'Notificación al equipo del proyecto enviada')
    return true
  }

  private async updateProgress(config: any): Promise<boolean> {
    const { projectId, progreso, notas } = config
    const tenantClient = await getTenantDb(this.context.tenantId)
    
    await tenantClient.proyecto.update({
      where: { id: projectId || this.context.projectId },
      data: {
        progreso: progreso || 0,
        notasActualizacion: notas,
        ultimaActualizacion: new Date(),
      },
    })
    
    await this.log('update_progress', 'action', 'success', `Progreso actualizado: ${progreso}%`)
    return true
  }

  private async createMilestone(config: any): Promise<boolean> {
    const { projectId, nombre, descripcion, fechaEntrega } = config
    const tenantClient = await getTenantDb(this.context.tenantId)
    
    const hito = await tenantClient.proyectoHito.create({
      data: {
        tenantId: this.context.tenantId,
        proyectoId: projectId || this.context.projectId,
        nombre,
        descripcion,
        fechaEntrega: fechaEntrega || new Date(),
        estado: 'pendiente',
      },
    })
    
    await this.log('create_milestone', 'action', 'success', `Hito "${nombre}" creado`)
    return true
  }

  private async notifyMilestone(config: any): Promise<boolean> {
    const { milestoneId, tipoNotificacion } = config
    const tenantClient = await getTenantDb(this.context.tenantId)
    
    const hito = await tenantClient.proyectoHito.findUnique({
      where: { id: milestoneId || this.context.milestoneId },
      include: { proyecto: true },
    })
    
    const { notifyByTelegram } = await import('@/lib/skills/notification-layer')
    const context = createSystemContext(this.context.tenantId)
    
    const message = tipoNotificacion === 'proximamente'
      ? `📌 *Hito Próximo*\n\nProyecto: ${hito?.proyecto?.nombre}\nHito: ${hito?.nombre}\nFecha: ${new Date(hito?.fechaEntrega).toLocaleDateString()}`
      : `✅ *Hito Completado*\n\nProyecto: ${hito?.proyecto?.nombre}\nHito: ${hito?.nombre}`
    
    notifyByTelegram(message, context).catch(() => {})
    
    await this.log('notify_milestone', 'action', 'success', 'Notificación de hito enviada')
    return true
  }

  private async generateProjectReport(config: any): Promise<boolean> {
    const { projectId, tipoReporte } = config
    const tenantClient = await getTenantDb(this.context.tenantId)
    
    const proyecto = await tenantClient.proyecto.findUnique({
      where: { id: projectId || this.context.projectId },
      include: { hitos: true, tareas: true, miembros: true },
    })
    
    const hitosCompletados = proyecto?.hitos.filter((h: any) => h.estado === 'completado').length || 0
    const totalHitos = proyecto?.hitos.length || 0
    const tareasCompletadas = proyecto?.tareas.filter((t: any) => t.estado === 'completada').length || 0
    const totalTareas = proyecto?.tareas.length || 0
    
    const reporte = {
      projectId: proyecto?.id,
      nombre: proyecto?.nombre,
      progreso: proyecto?.progreso || 0,
      hitos: { completados: hitosCompletados, total: totalHitos },
      tareas: { completadas: tareasCompletadas, total: totalTareas },
      miembros: proyecto?.miembros.length || 0,
      tipo: tipoReporte || 'general',
      fecha: new Date(),
    }
    
    await tenantClient.reporteProyecto.create({
      data: {
        tenantId: this.context.tenantId,
        proyectoId: proyecto?.id,
        tipo: tipoReporte,
        datos: JSON.stringify(reporte),
      },
    })
    
    await this.log('generate_project_report', 'action', 'success', 'Reporte de proyecto generado')
    return true
  }

  private async createProjectTask(config: any): Promise<boolean> {
    const { projectId, titulo, descripcion, asignadoA, fechaVencimiento, prioridad } = config
    const tenantClient = await getTenantDb(this.context.tenantId)
    
    await tenantClient.proyectoTarea.create({
      data: {
        tenantId: this.context.tenantId,
        proyectoId: projectId || this.context.projectId,
        titulo,
        descripcion,
        asignadoA,
        fechaVencimiento,
        prioridad: prioridad || 'media',
        estado: 'pendiente',
      },
    })
    
    await this.log('create_project_task', 'action', 'success', `Tarea "${titulo}" creada en proyecto`)
    return true
  }

  private async assignDeliverable(config: any): Promise<boolean> {
    const { projectId, milestoneId, nombre, descripcion, asignarA, fechaEntrega } = config
    const tenantClient = await getTenantDb(this.context.tenantId)
    
    const targetProjectId = projectId || this.context.projectId
    
    await tenantClient.proyectoEntregable.create({
      data: {
        tenantId: this.context.tenantId,
        projectId: targetProjectId,
        milestoneId: milestoneId || this.context.milestoneId,
        nombre: nombre || 'Entregable',
        descripcion: descripcion,
        estado: 'asignado',
        fechaEntrega: fechaEntrega || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        asignadoA: asignarA || this.context.userId,
      },
    })
    
    await this.log('assign_deliverable', 'action', 'success', `Entregable asignado`)
    return true
  }
}

/**
 * Lista de triggers válidos del sistema
 */
export const VALID_TRIGGERS = {
  // CRM / Leads
  nuevo_lead: 'Nuevo Lead Creado',
  lead_actualizado: 'Lead Actualizado',
  lead_etiquetado: 'Lead Etiquetado',
  lead_sin_respuesta: 'Lead Sin Respuesta (24h)',
  
  // Citas
  cita_agendada: 'Cita Agendada',
  cita_confirmada: 'Cita Confirmada',
  cita_cancelada: 'Cita Cancelada',
  
  // Academia (LMS)
  estudiante_inscrito: 'Estudiante Inscrito',
  estudiante_completa_curso: 'Completa Curso',
  leccion_completada: 'Lección Completada',
  
  // Pagos
  pago_recibido: 'Pago Recibido',
  pago_fallido: 'Pago Fallido',
  
  // Externos / n8n
  webhook_recibido: 'Webhook Recibido',
  n8n_workflow_completado: 'Workflow n8n Completado',
  n8n_workflow_fallido: 'Workflow n8n Fallido',
  evento_externo: 'Evento Externo',
} as const

export type TriggerType = keyof typeof VALID_TRIGGERS

export async function triggerAutomation(trigger: string, context: ExecutionContext) {
  try {
    // Validar que se proporcione tenantId
    if (!context.tenantId) {
      console.warn('⚠️ [Automatización] No se proporcionó tenantId, no se ejecutarán automatizaciones')
      return
    }

    // Rate limiting: max 100 ejecuciones por minuto por tenant
    const rateLimitKey = `rate_limit:${context.tenantId}:${trigger}:${Math.floor(Date.now() / 60000)}`
    const rateLimit = globalThis as any
    if (!rateLimit._automationRateLimit) rateLimit._automationRateLimit = new Map()
    const counts = rateLimit._automationRateLimit.get(rateLimitKey) || 0
    if (counts >= 100) {
      console.warn(`⚠️ [Automatización] Rate limit excedido para tenant ${context.tenantId}, trigger ${trigger}`)
      return
    }
    rateLimit._automationRateLimit.set(rateLimitKey, counts + 1)

    // Log adicional para triggers externos
    const isExternalTrigger = ['n8n_workflow_completado', 'n8n_workflow_fallido', 'evento_externo', 'webhook_recibido'].includes(trigger)
    if (isExternalTrigger) {
      console.log(`🔗 [Automatización] Trigger externo recibido: ${trigger}`, {
        workflowId: context.workflowId,
        workflowName: context.workflowName,
        source: context.source,
      })
    }

    // Get the correct DB client for this tenant (handles isolated DBs)
    const { getTenantDb, dbContext } = await import('./db')
    const tenantClient = await getTenantDb(context.tenantId)

    // Buscar automatizaciones activas con este trigger para el tenant específico
    const automations = await dbContext.run(
      { tenantId: context.tenantId, client: tenantClient },
      async () => {
        return tenantClient.automation.findMany({
          where: {
            trigger,
            activo: true,
          },
        })
      }
    )

    console.log(`📋 [Automatización] Ejecutando ${automations.length} automatizaciones para trigger "${trigger}"`)

    // Ejecutar cada automatización
    for (const automation of automations) {
      await dbContext.run(
        { tenantId: context.tenantId!, client: tenantClient },
        async () => {
          const engine = new AutomationEngine(automation.id, context)
          await engine.execute()
        }
      )
    }

    // Para triggers de workflow completado, podemos encolar acciones de seguimiento
    if (trigger === 'n8n_workflow_completado' && context.workflowId) {
      console.log(`✅ [Automatización] Workflow ${context.workflowName || context.workflowId} completado exitosamente`)
    }

    if (trigger === 'n8n_workflow_fallido' && context.workflowId) {
      console.log(`❌ [Automatización] Workflow ${context.workflowName || context.workflowId} falló: ${context.error || 'Error desconocido'}`)
    }
  } catch (error) {
    console.error('❌ [Automatización] Error ejecutando automatizaciones:', error)
  }
}

/**
 * Encola una ejecución de automatización para procesamiento diferido
 */
export async function enqueueAutomation(
  trigger: string, 
  context: ExecutionContext, 
  options: { delayMs?: number; maxAttempts?: number; priority?: number } = {}
) {
  const { executionQueue } = await import('./execution-queue')
  
  if (!context.tenantId) {
    console.warn('⚠️ [Automatización] No se puede encolar sin tenantId')
    return null
  }

  return executionQueue.enqueue({
    tenantId: context.tenantId,
    type: 'automation',
    targetId: trigger,
    payload: { trigger, ...context },
    delayMs: options.delayMs || 0,
    maxAttempts: options.maxAttempts || 3,
    priority: options.priority || 5,
  })
}

/**
 * Procesa las tareas programadas que ya llegó su hora de ejecución
 * Esta función debe ejecutarse periódicamente (ej: cada minuto)
 * Itera por todos los tenants para soportar BDs aisladas
 */
export async function processScheduledAutomationTasks() {
  try {
    const { globalPrisma, getTenantDb, dbContext } = await import('./db')

    // Obtener todos los tenants con BDs
    const tenants = await globalPrisma.tenant.findMany({
      select: { id: true, dbUrl: true },
    })

    let totalProcessed = 0

    for (const tenant of tenants) {
      try {
        // Obtener el cliente correcto para este tenant
        const tenantClient = await getTenantDb(tenant.id)

        // Ejecutar la consulta dentro del contexto del tenant
        const tasks = await dbContext.run(
          { tenantId: tenant.id, client: tenantClient },
          async () => {
            return tenantClient.scheduledAutomationTask.findMany({
              where: {
                estado: 'pendiente',
                scheduledFor: {
                  lte: new Date(),
                },
              },
              include: {
                automation: true,
              },
            })
          }
        )

        for (const task of tasks) {
          try {
            await dbContext.run(
              { tenantId: tenant.id, client: tenantClient },
              async () => {
                await tenantClient.scheduledAutomationTask.update({
                  where: { id: task.id },
                  data: {
                    estado: 'ejecutado',
                    fechaEjecucion: new Date(),
                  },
                })

                const engine = new AutomationEngine(
                  task.automationId,
                  { ...task.contextData, tenantId: tenant.id } as ExecutionContext
                )

                await engine.execute()
              }
            )
          } catch (error) {
            console.error(`Error ejecutando tarea programada ${task.id}:`, error)

            await dbContext.run(
              { tenantId: tenant.id, client: tenantClient },
              async () => {
                await tenantClient.scheduledAutomationTask.update({
                  where: { id: task.id },
                  data: {
                    estado: 'cancelado',
                  },
                })
              }
            )
          }
        }

        totalProcessed += tasks.length
      } catch (error) {
        console.error(`Error procesando tareas para tenant ${tenant.id}:`, error)
      }
    }

    return totalProcessed
  } catch (error) {
    console.error('Error procesando tareas programadas:', error)
    return 0
  }
}

/**
 * Procesa recordatorios de citas pendientes
 * Envía email de recordatorio 24h antes y 1h antes de la cita
 * Debe llamarse periódicamente (cada 5-15 min)
 */
export async function processAppointmentReminders() {
  try {
    const { globalPrisma, getTenantDb, dbContext } = await import('./db')
    const { sendAppointmentReminder } = await import('./email')

    const now = new Date()
    const reminder24h = new Date(now.getTime() + 24 * 60 * 60 * 1000)
    const reminder1h = new Date(now.getTime() + 1 * 60 * 60 * 1000)

    const tenants = await globalPrisma.tenant.findMany({
      select: { id: true, dbUrl: true },
    })

    let totalSent = 0

    for (const tenant of tenants) {
      try {
        const tenantClient = await getTenantDb(tenant.id)

        await dbContext.run(
          { tenantId: tenant.id, client: tenantClient },
          async () => {
            // Recordatorios 24h
            const citas24h = await tenantClient.cita.findMany({
              where: {
                estado: { in: ['pendiente', 'confirmada'] },
                fechaHora: { gte: now, lte: reminder24h },
                recordatorio24hEnviado: false,
                lead: { email: { not: null } },
              },
              include: {
                lead: true,
                servicio: true,
              },
            })

            for (const cita of citas24h) {
              try {
                await sendAppointmentReminder({
                  id: cita.id,
                  lead: { nombre: cita.lead.nombre, email: cita.lead.email! },
                  servicio: { nombre: cita.servicio?.nombre || cita.titulo || 'Cita' },
                  fechaHora: cita.fechaHora,
                  tenantId: tenant.id,
                })

                await tenantClient.cita.update({
                  where: { id: cita.id },
                  data: { recordatorio24hEnviado: true },
                })

                totalSent++
                console.log(`📧 Recordatorio 24h enviado para cita ${cita.id}`)

                // Notificación por Telegram al admin
                try {
                  const { notifyByTelegram } = await import('@/lib/skills/notification-layer');
                  notifyByTelegram(
                    `⏰ *Recordatorio de Cita (24h)*\n\n👤 *Cliente:* ${cita.lead.nombre}\n📋 *Servicio:* ${cita.servicio?.nombre || cita.titulo}\n🕐 *Fecha:* ${new Date(cita.fechaHora).toLocaleString('es-MX')}`,
                    createSystemContext(tenant.id)
                  ).catch(() => {})
                } catch (e) {}
              } catch (error) {
                console.error(`Error enviando recordatorio 24h para cita ${cita.id}:`, error)
              }
            }

            // Recordatorios 1h
            const citas1h = await tenantClient.cita.findMany({
              where: {
                estado: { in: ['pendiente', 'confirmada'] },
                fechaHora: { gte: now, lte: reminder1h },
                recordatorio1hEnviado: false,
                lead: { email: { not: null } },
              },
              include: {
                lead: true,
                servicio: true,
              },
            })

            for (const cita of citas1h) {
              try {
                await sendAppointmentReminder({
                  id: cita.id,
                  lead: { nombre: cita.lead.nombre, email: cita.lead.email! },
                  servicio: { nombre: cita.servicio?.nombre || cita.titulo || 'Cita' },
                  fechaHora: cita.fechaHora,
                  tenantId: tenant.id,
                })

                await tenantClient.cita.update({
                  where: { id: cita.id },
                  data: { recordatorio1hEnviado: true },
                })

                totalSent++
                console.log(`📧 Recordatorio 1h enviado para cita ${cita.id}`)

                // Notificación por Telegram al admin
                try {
                  const { notifyByTelegram } = await import('@/lib/skills/notification-layer');
                  notifyByTelegram(
                    `⏰ *Recordatorio de Cita (1h)*\n\n👤 *Cliente:* ${cita.lead.nombre}\n📋 *Servicio:* ${cita.servicio?.nombre || cita.titulo}\n🕐 *Fecha:* ${new Date(cita.fechaHora).toLocaleString('es-MX')}`,
                    createSystemContext(tenant.id)
                  ).catch(() => {})
                } catch (e) {}
              } catch (error) {
                console.error(`Error enviando recordatorio 1h para cita ${cita.id}:`, error)
              }
            }
          }
        )
      } catch (error) {
        console.error(`Error procesando recordatorios para tenant ${tenant.id}:`, error)
      }
    }

    if (totalSent > 0) {
      console.log(`📧 Total recordatorios enviados: ${totalSent}`)
    }

    return totalSent
  } catch (error) {
    console.error('Error procesando recordatorios de citas:', error)
    return 0
  }
}

/**
 * Procesa recordatorios de pagos próximos a vencer
 * Se ejecuta diariamente - notifica 3 días antes y 1 día antes del vencimiento
 */
export async function processPaymentReminders() {
  console.log('💳 Procesando recordatorios de pagos...')
  
  const { getTenantDb } = await import('./db')
  const tenants = await prisma.tenant.findMany({
    where: { estado: 'activo' }
  })

  let totalSent = 0

  for (const tenant of tenants) {
    try {
      const tenantClient = await getTenantDb(tenant.id)
      const now = new Date()
      
      // Pagos que vencen en 3 días
      const fecha3dias = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000)
      const pagos3dias = await tenantClient.contratoPago.findMany({
        where: {
          estado: 'pendiente',
          fechaProgramada: { gte: now, lte: fecha3dias }
        },
        include: {
          contrato: {
            include: { lead: true }
          }
        }
      })

      // Pagos que vencen en 1 día
      const fecha1dia = new Date(now.getTime() + 1 * 24 * 60 * 60 * 1000)
      const pagos1dia = await tenantClient.contratoPago.findMany({
        where: {
          estado: 'pendiente',
          fechaProgramada: { gte: now, lte: fecha1dia }
        },
        include: {
          contrato: {
            include: { lead: true }
          }
        }
      })

      // Enviar notificación 3 días antes
      for (const pago of pagos3dias) {
        const { notifyByTelegram } = await import('@/lib/skills/notification-layer');
        notifyByTelegram(
          `💳 *Pago por Vencer (3 días)*\n\n📋 *Pago:* ${pago.numero}\n👤 *Cliente:* ${pago.contrato?.lead?.nombre || 'N/A'}\n💰 *Monto:* ${pago.monto} ${pago.moneda}\n📅 *Vence:* ${new Date(pago.fechaProgramada).toLocaleDateString('es-MX')}`,
          createSystemContext(tenant.id)
        ).catch(() => {})
        totalSent++
      }

      // Enviar notificación 1 día antes
      for (const pago of pagos1dia) {
        const { notifyByTelegram } = await import('@/lib/skills/notification-layer');
        notifyByTelegram(
          `⚠️ *Pago por Vencer (MAÑANA)*\n\n📋 *Pago:* ${pago.numero}\n👤 *Cliente:* ${pago.contrato?.lead?.nombre || 'N/A'}\n💰 *Monto:* ${pago.monto} ${pago.moneda}\n📅 *Vence:* ${new Date(pago.fechaProgramada).toLocaleDateString('es-MX')}`,
          createSystemContext(tenant.id)
        ).catch(() => {})
        totalSent++
      }

    } catch (error) {
      console.error(`Error procesando recordatorios de pagos para tenant ${tenant.id}:`, error)
    }
  }

console.log(`💳 Total notificaciones de pagos enviadas: ${totalSent}`)
  return totalSent
}
