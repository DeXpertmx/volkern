import { prisma } from './db'
import { Node, Edge } from 'reactflow'
import { evaluateCondition as evaluateConditionFn } from './automation/condition-evaluator'
import { replaceVariables } from './automation/variables-parser'
import { ACTION_REGISTRY } from './automation/actions'
import type { ActionContext, ExecutionContext } from './automation/types'

// Re-export for backward compatibility
export { VALID_TRIGGERS } from './automation/constants'
export type { TriggerType } from './automation/constants'
export type { ExecutionContext, ActionContext, ActionHandler } from './automation/types'

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
          contextData: this.context as any,
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
        }) as Record<string, any> | undefined
      }

      if (this.context.citaId) {
        this.context.cita = await prisma.cita.findUnique({
          where: { id: this.context.citaId },
          include: {
            lead: { include: { perfilFiscal: true } },
            servicio: true,
          },
        }) as Record<string, any> | undefined
        if (this.context.cita) {
          this.context.lead = this.context.cita.lead
        }
      }

      // Enriquecer contexto con datos del estudiante
      if (this.context.estudianteId) {
        this.context.estudiante = await prisma.estudiante.findUnique({
          where: { id: this.context.estudianteId },
        }) as Record<string, any> | undefined
      }

      if (this.context.cursoId) {
        this.context.curso = await prisma.curso.findUnique({
          where: { id: this.context.cursoId },
        }) as Record<string, any> | undefined
      }

      if (this.context.inscripcionId) {
        this.context.inscripcion = await prisma.inscripcion.findUnique({
          where: { id: this.context.inscripcionId },
          include: {
            estudiante: true,
            curso: true,
          },
        }) as Record<string, any> | undefined
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
    const actionType = config.actionType

    if (!actionType) {
      await this.log(node.id, 'action', 'warning', 'Accion sin actionType definido')
      return false
    }

    const handler = ACTION_REGISTRY[actionType]
    if (!handler) {
      await this.log(node.id, 'action', 'warning', `Accion no implementada: ${actionType}`)
      return false
    }

    const actionContext: ActionContext = {
      state: this.context,
      automationId: this.automationId,
      executionId: this.executionId,
      log: (nId, nType, status, msg) => this.log(nId, nType, status, msg),
      replaceVariables: (text) => replaceVariables(text, this.context),
      dispatchAction: (cfg) => this.executeAction(node),
    }

    return await handler(config, actionContext)
  }

  private async executeCondition(node: Node): Promise<boolean> {
    const config = node.data.config || {}
    const result = evaluateConditionFn(config, this.context)

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
          contextData: this.context as any,
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

  private replaceVariables(text: string): string {
    return replaceVariables(text, this.context)
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

// ─── Standalone Functions ───────────────────────────────────────────

/**
 * Versión síncrona de triggerAutomation.
 * Busca automatizaciones activas para el trigger y las ejecuta.
 * Expuesta para uso interno del worker BullMQ.
 */
export async function executeAutomationsSync(trigger: string, context: ExecutionContext) {
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
 * triggerAutomation — Encola o ejecuta una automatización.
 *
 * Intenta encolar en BullMQ para procesamiento diferido.
 * Si Redis no está disponible (BullMQ desactivado), ejecuta
 * síncronamente como fallback.
 *
 * @returns jobId si se encoló, o undefined si se ejecutó síncrono
 */
export async function triggerAutomation(trigger: string, context: ExecutionContext) {
  if (!context.tenantId) {
    console.warn('⚠️ [Automatización] No se proporcionó tenantId, no se ejecutarán automatizaciones')
    return
  }

  try {
    // Intentar encolar en BullMQ — retorna null si Redis no está disponible
    const jobId = await enqueueAutomation(trigger, context, {
      priority: 5,
      maxAttempts: 3,
    })

    if (jobId) {
      console.log(`📤 [Automatización] Encolado trigger "${trigger}" → job ${jobId}`)
      return jobId
    }
  } catch (err) {
    console.warn('⚠️ [Automatización] Error al encolar, ejecutando síncrono:', err)
  }

  // Fallback: ejecutar síncronamente (Redis no disponible)
  console.log(`⚡ [Automatización] Fallback síncrono para trigger "${trigger}"`)
  await executeAutomationsSync(trigger, context)
}

/**
 * Encola una ejecución de automatización para procesamiento diferido en BullMQ.
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
                  { ...(task.contextData as any || {}), tenantId: tenant.id } as ExecutionContext
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
            const citas24h =                await (tenantClient as any).cita.findMany({
              where: {
                estado: { in: ['pendiente', 'confirmada'] },
                fechaHora: { gte: now, lte: reminder24h },
                recordatorio24hEnviado: false,
                lead: { email: { not: '' } },
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
                  const { notifyByTelegram } = await import('@/lib/skills/notification-layer')
                  const { createSystemContext } = await import('@/lib/skills/context')
                  notifyByTelegram(
                    `⏰ *Recordatorio de Cita (24h)*\n\n👤 *Cliente:* ${(cita as any).lead.nombre}\n📋 *Servicio:* ${(cita as any).servicio?.nombre || cita.titulo}\n🕐 *Fecha:* ${new Date(cita.fechaHora).toLocaleString('es-MX')}`,
                    createSystemContext(tenant.id)
                  ).catch(() => {})
                } catch (e) {}
              } catch (error) {
                console.error(`Error enviando recordatorio 24h para cita ${cita.id}:`, error)
              }
            }

            // Recordatorios 1h
            const citas1h = await (tenantClient as any).cita.findMany({
              where: {
                estado: { in: ['pendiente', 'confirmada'] },
                fechaHora: { gte: now, lte: reminder1h },
                recordatorio1hEnviado: false,
                lead: { email: { not: '' } },
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

                await (tenantClient as any).cita.update({
                  where: { id: cita.id },
                  data: { recordatorio1hEnviado: true },
                })

                totalSent++
                console.log(`📧 Recordatorio 1h enviado para cita ${cita.id}`)

                // Notificación por Telegram al admin
                try {
                  const { notifyByTelegram } = await import('@/lib/skills/notification-layer')
                  const { createSystemContext } = await import('@/lib/skills/context')
                  notifyByTelegram(
                    `⏰ *Recordatorio de Cita (1h)*\n\n👤 *Cliente:* ${(cita as any).lead.nombre}\n📋 *Servicio:* ${(cita as any).servicio?.nombre || cita.titulo}\n🕐 *Fecha:* ${new Date(cita.fechaHora).toLocaleString('es-MX')}`,
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
        const { notifyByTelegram } = await import('@/lib/skills/notification-layer')
        const { createSystemContext } = await import('@/lib/skills/context')
        notifyByTelegram(
          `💳 *Pago por Vencer (3 días)*\n\n📋 *Pago:* ${pago.numero}\n👤 *Cliente:* ${pago.contrato?.lead?.nombre || 'N/A'}\n💰 *Monto:* ${pago.monto} ${pago.moneda}\n📅 *Vence:* ${new Date(pago.fechaProgramada).toLocaleDateString('es-MX')}`,
          createSystemContext(tenant.id)
        ).catch(() => {})
        totalSent++
      }

      // Enviar notificación 1 día antes
      for (const pago of pagos1dia) {
        const { notifyByTelegram } = await import('@/lib/skills/notification-layer')
        const { createSystemContext } = await import('@/lib/skills/context')
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
