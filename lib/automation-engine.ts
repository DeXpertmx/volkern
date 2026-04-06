
import { prisma } from './db'
import { Node, Edge } from 'reactflow'
import { sendWhatsAppMessage } from './whatsapp'
import { sendEmail as sendResendEmail } from './resend-email'
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
        return await this.createStripeInvoice(config)
      case 'crear_factura_holded':
        return await this.createHoldedInvoice(config)
      case 'crear_factura_square':
        return await this.createSquareInvoice(config)
      case 'cobrar_gocardless':
        return await this.createGoCardlessPayment(config)
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

  private async sendEmail(config: any): Promise<boolean> {
    const { subject, message } = config
    const contacto = this.context.lead || this.context.estudiante

    if (!contacto?.email) return false

    // Reemplazar variables
    const processedMessage = this.replaceVariables(message)
    const processedSubject = this.replaceVariables(subject)

    try {
      await sendResendEmail({
        to: contacto.email,
        subject: processedSubject,
        html: processedMessage,
      })
      return true
    } catch (error) {
      console.error('Error enviando email:', error)
      return false
    }
  }

  private async sendSMS(config: any): Promise<boolean> {
    const { message } = config
    const contacto = this.context.lead || this.context.estudiante

    if (!contacto?.telefono) return false

    const processedMessage = this.replaceVariables(message)

    try {
      await sendTwilioSMS(contacto.telefono, processedMessage)
      return true
    } catch (error) {
      console.error('Error enviando SMS:', error)
      return false
    }
  }

  private async sendWhatsApp(config: any): Promise<boolean> {
    const { message } = config
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
      console.error('Error enviando WhatsApp:', error)
      return false
    }
  }

  private async sendTelegram(config: any): Promise<boolean> {
    const { message, chatId } = config
    const tenantId = this.context.tenantId

    if (!tenantId) {
      console.error('[Automation] No tenantId in context for sendTelegram')
      return false
    }

    const processedMessage = this.replaceVariables(message)

    try {
      // Cargar credenciales específicas del tenant
      const creds = await loadTelegramCredentials(tenantId)
      
      // Usar chatId del nodo o el admin_chat_id de la integración
      const finalChatId = chatId || creds?.admin_chat_id
      
      if (!finalChatId) {
        console.error('[Automation] No chatId provided for sendTelegram')
        return false
      }

      await sendTelegramMessage(finalChatId, processedMessage, creds?.bot_token)
      return true
    } catch (error) {
      console.error('Error enviando Telegram desde automatización:', error)
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

  private async createStripeInvoice(config: any): Promise<boolean> {
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
        description: description || 'Factura generada automáticamente (Stripe)',
        items: items.length > 0 ? items : [{ name: 'Servicio', quantity: 1, price: amount || 0 }]
      })
      return true
    } catch (error) {
      console.error('Error creando factura Stripe en automatización:', error)
      return false
    }
  }

  private async createHoldedInvoice(config: any): Promise<boolean> {
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
        description: description || 'Factura generada automáticamente (Holded)',
        items: items.length > 0 ? items : [{ name: 'Servicio', quantity: 1, price: amount || 0 }]
      })
      return true
    } catch (error) {
      console.error('Error creando factura Holded en automatización:', error)
      return false
    }
  }

  private async createSquareInvoice(config: any): Promise<boolean> {
    const { amount, currency = 'USD', description, items = [] } = config
    const tenantId = this.context.tenantId

    if (!tenantId) return false

    try {
      await InvoicingService.createInvoice({
        tenantId,
        leadId: this.context.leadId,
        contactId: this.context.contactId,
        amount: amount || 0,
        currency,
        description: description || 'Factura generada automáticamente (Square)',
        items: items.length > 0 ? items : [{ name: 'Servicio', quantity: 1, price: amount || 0 }]
      })
      return true
    } catch (error) {
      console.error('Error creando factura Square en automatización:', error)
      return false
    }
  }

  private async createGoCardlessPayment(config: any): Promise<boolean> {
    const { amount, currency = 'EUR', description } = config
    const tenantId = this.context.tenantId

    if (!tenantId) return false

    try {
      await InvoicingService.createInvoice({
        tenantId,
        leadId: this.context.leadId,
        contactId: this.context.contactId,
        amount: amount || 0,
        currency,
        description: description || 'Cobro por domiciliación (GoCardless)',
      })
      return true
    } catch (error) {
      console.error('Error procesando cobro GoCardless en automatización:', error)
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

    await prisma.automation.update({
      where: { id: automationId },
      data: { activo: false },
    })

    return true
  }

  private async activateAutomation(config: any): Promise<boolean> {
    const { automationId } = config

    if (!automationId) return false

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

      processed = processed
        .replace(/\{nombre\}/g, lead.nombre || '')
        .replace(/\{lead\.nombre\}/g, lead.nombre || '')
        .replace(/\{email\}/g, lead.email || '')
        .replace(/\{lead\.email\}/g, lead.email || '')
        .replace(/\{telefono\}/g, lead.telefono || '')
        .replace(/\{lead\.telefono\}/g, lead.telefono || '')
        .replace(/\{lead\.estado\}/g, lead.estado || '')
        .replace(/\{empresa\}/g, lead.empresa || '')
        .replace(/\{id_fiscal\}/g, lead.perfilFiscal?.idFiscal || '')
        .replace(/\{fecha_hoy\}/g, fechaHoy)
    }

    // Variables de estudiante
    if (estudiante) {
      processed = processed
        .replace(/\{nombre\}/g, estudiante.nombre || '')
        .replace(/\{estudiante\.nombre\}/g, estudiante.nombre || '')
        .replace(/\{email\}/g, estudiante.email || '')
        .replace(/\{estudiante\.email\}/g, estudiante.email || '')
        .replace(/\{telefono\}/g, estudiante.telefono || '')
        .replace(/\{estudiante\.telefono\}/g, estudiante.telefono || '')
    }

    // Variables de curso
    if (curso) {
      processed = processed
        .replace(/\{curso\.titulo\}/g, curso.titulo || '')
        .replace(/\{curso\.descripcion\}/g, curso.descripcion || '')
    }

    // Variables de cita
    if (cita) {
      processed = processed
        .replace(/\{cita\.fechaHora\}/g, cita.fechaHora ? new Date(cita.fechaHora).toLocaleString('es-MX') : '')
        .replace(/\{cita\.servicio\}/g, cita.servicio?.nombre || '')
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

    // Log adicional para triggers externos
    const isExternalTrigger = ['n8n_workflow_completado', 'n8n_workflow_fallido', 'evento_externo', 'webhook_recibido'].includes(trigger)
    if (isExternalTrigger) {
      console.log(`🔗 [Automatización] Trigger externo recibido: ${trigger}`, {
        workflowId: context.workflowId,
        workflowName: context.workflowName,
        source: context.source,
      })
    }

    // Buscar automatizaciones activas con este trigger para el tenant específico
    const automations = await prisma.automation.findMany({
      where: {
        tenantId: context.tenantId,
        trigger,
        activo: true,
      },
    })

    console.log(`📋 [Automatización] Ejecutando ${automations.length} automatizaciones para trigger "${trigger}"`)

    // Ejecutar cada automatización
    for (const automation of automations) {
      const engine = new AutomationEngine(automation.id, context)
      await engine.execute()
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
 */
export async function processScheduledAutomationTasks() {
  try {
    // Buscar tareas pendientes que ya deberían ejecutarse
    const tasks = await prisma.scheduledAutomationTask.findMany({
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

    for (const task of tasks) {
      try {
        // Marcar como ejecutado
        await prisma.scheduledAutomationTask.update({
          where: { id: task.id },
          data: {
            estado: 'ejecutado',
            fechaEjecucion: new Date(),
          },
        })

        // Crear nueva ejecución desde el nodo programado
        const engine = new AutomationEngine(
          task.automationId,
          task.contextData as ExecutionContext
        )

        // Ejecutar desde el nodo específico
        await engine.execute()
      } catch (error) {
        console.error(`Error ejecutando tarea programada ${task.id}:`, error)

        // Marcar como error
        await prisma.scheduledAutomationTask.update({
          where: { id: task.id },
          data: {
            estado: 'cancelado',
          },
        })
      }
    }

    return tasks.length
  } catch (error) {
    console.error('Error procesando tareas programadas:', error)
    return 0
  }
}
