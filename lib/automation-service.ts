/**
 * Automation Service
 * Capa intermedia entre Volkern y n8n
 * Traduce configuraciones de Volkern a formato n8n y viceversa
 */

import { prisma } from './db'
import { n8nClient, N8nWebhookPayload, N8nWorkflowData } from './n8n-client'

export interface VolkernAutomationConfig {
  tenantId: string
  automationId?: string
  executionId?: string
  trigger: string
  payload: Record<string, any>
  timeout?: number
  retryCount?: number
}

export interface WorkflowExecutionResult {
  success: boolean
  workflowId: string
  executionId?: string
  response?: any
  error?: string
  duration?: number
}

const MAX_RETRIES = 3
const RETRY_DELAYS = [1000, 3000, 5000] // Backoff exponencial

class AutomationService {
  /**
   * Ejecuta un workflow externo con los datos proporcionados
   */
  async executeExternalWorkflow(
    workflowId: string,
    config: VolkernAutomationConfig
  ): Promise<WorkflowExecutionResult> {
    const startTime = Date.now()
    const retryCount = config.retryCount ?? MAX_RETRIES

    // Buscar el workflow en la base de datos
    const workflow = await prisma.n8nWorkflow.findFirst({
      where: {
        id: workflowId,
        tenantId: config.tenantId,
        activo: true,
      },
    })

    if (!workflow) {
      return {
        success: false,
        workflowId,
        error: 'Workflow no encontrado o inactivo',
        duration: Date.now() - startTime,
      }
    }

    // Preparar payload con variables de Volkern
    const payload: N8nWebhookPayload = {
      tenantId: config.tenantId,
      event: config.trigger,
      data: this.preparePayload(config.payload, workflow.configPayload as Record<string, any>),
      automationId: config.automationId,
      executionId: config.executionId,
      timestamp: new Date().toISOString(),
    }

    // Intentar ejecutar con reintentos
    let lastError: Error | null = null
    for (let attempt = 0; attempt <= retryCount; attempt++) {
      try {
        if (attempt > 0) {
          await this.delay(RETRY_DELAYS[attempt - 1] || 5000)
          console.log(`[AutomationService] Reintento ${attempt} para workflow ${workflowId}`)
        }

        let response: any

        // Ejecutar via webhook si está disponible, sino via API directa
        if (workflow.webhookUrl) {
          response = await n8nClient.executeViaWebhook(
            workflow.webhookUrl,
            payload,
            config.timeout || 30000
          )
        } else {
          // Ejecutar directamente via API de n8n
          response = await n8nClient.executeWorkflow(workflow.n8nWorkflowId, payload)
        }

        const duration = Date.now() - startTime

        // Actualizar estadísticas del workflow
        await prisma.n8nWorkflow.update({
          where: { id: workflowId },
          data: {
            ultimaEjecucion: new Date(),
            totalEjecuciones: { increment: 1 },
            ejecucionesExitosas: { increment: 1 },
          },
        })

        return {
          success: true,
          workflowId,
          executionId: response.id || response.executionId,
          response,
          duration,
        }
      } catch (error: any) {
        lastError = error
        console.error(`[AutomationService] Error en intento ${attempt}:`, error.message)
      }
    }

    // Todos los intentos fallaron
    const duration = Date.now() - startTime

    // Actualizar estadísticas de fallo
    await prisma.n8nWorkflow.update({
      where: { id: workflowId },
      data: {
        ultimaEjecucion: new Date(),
        totalEjecuciones: { increment: 1 },
        ejecucionesFallidas: { increment: 1 },
      },
    })

    return {
      success: false,
      workflowId,
      error: lastError?.message || 'Error desconocido',
      duration,
    }
  }

  /**
   * Registra un workflow de n8n en Volkern
   */
  async registerWorkflow(
    tenantId: string,
    n8nWorkflowId: string,
    config: {
      nombre: string
      descripcion?: string
      trigger: string
      configPayload?: Record<string, any>
      webhookUrl?: string
    }
  ): Promise<any> {
    // Verificar que el workflow existe en n8n
    const n8nWorkflow = await n8nClient.getWorkflow(n8nWorkflowId)
    if (!n8nWorkflow) {
      throw new Error('El workflow no existe en n8n')
    }

    // Crear o actualizar registro en Volkern
    return await prisma.n8nWorkflow.upsert({
      where: {
        tenantId_n8nWorkflowId: {
          tenantId,
          n8nWorkflowId,
        },
      },
      update: {
        nombre: config.nombre,
        descripcion: config.descripcion,
        trigger: config.trigger,
        configPayload: config.configPayload,
        webhookUrl: config.webhookUrl,
        updatedAt: new Date(),
      },
      create: {
        tenantId,
        n8nWorkflowId,
        nombre: config.nombre,
        descripcion: config.descripcion,
        trigger: config.trigger,
        configPayload: config.configPayload,
        webhookUrl: config.webhookUrl,
      },
    })
  }

  /**
   * Sincroniza workflows desde n8n
   */
  async syncWorkflowsFromN8n(tenantId: string): Promise<{
    synced: number
    added: number
    updated: number
    removed: number
  }> {
    try {
      const n8nWorkflows = await n8nClient.listWorkflows()
      const existingWorkflows = await prisma.n8nWorkflow.findMany({
        where: { tenantId },
      })

      const existingIds = new Set(existingWorkflows.map((w) => w.n8nWorkflowId))
      const n8nIds = new Set(n8nWorkflows.map((w) => w.id!))

      let added = 0
      let updated = 0
      let removed = 0

      // Agregar/actualizar workflows de n8n
      for (const n8nWf of n8nWorkflows) {
        if (!n8nWf.id) continue

        if (existingIds.has(n8nWf.id)) {
          // Actualizar
          await prisma.n8nWorkflow.updateMany({
            where: {
              tenantId,
              n8nWorkflowId: n8nWf.id,
            },
            data: {
              nombre: n8nWf.name,
              activo: n8nWf.active || false,
              updatedAt: new Date(),
            },
          })
          updated++
        } else {
          // Crear nuevo (sin trigger por defecto, se configura después)
          await prisma.n8nWorkflow.create({
            data: {
              tenantId,
              n8nWorkflowId: n8nWf.id,
              nombre: n8nWf.name,
              trigger: 'manual', // Se configura después desde UI
              activo: false, // Inactivo hasta que se configure
            },
          })
          added++
        }
      }

      // Marcar como inactivos los que ya no existen en n8n
      for (const existing of existingWorkflows) {
        if (!n8nIds.has(existing.n8nWorkflowId)) {
          await prisma.n8nWorkflow.update({
            where: { id: existing.id },
            data: { activo: false },
          })
          removed++
        }
      }

      return {
        synced: n8nWorkflows.length,
        added,
        updated,
        removed,
      }
    } catch (error) {
      console.error('[AutomationService] Error syncing workflows:', error)
      throw error
    }
  }

  /**
   * Lista workflows disponibles para un tenant
   */
  async listWorkflows(tenantId: string, activeOnly: boolean = true): Promise<any[]> {
    return await prisma.n8nWorkflow.findMany({
      where: {
        tenantId,
        ...(activeOnly ? { activo: true } : {}),
      },
      orderBy: { nombre: 'asc' },
    })
  }

  /**
   * Obtiene workflows por trigger
   */
  async getWorkflowsByTrigger(tenantId: string, trigger: string): Promise<any[]> {
    return await prisma.n8nWorkflow.findMany({
      where: {
        tenantId,
        trigger,
        activo: true,
      },
    })
  }

  /**
   * Activa/desactiva un workflow
   */
  async toggleWorkflow(workflowId: string, tenantId: string, active: boolean): Promise<any> {
    const workflow = await prisma.n8nWorkflow.findFirst({
      where: { id: workflowId, tenantId },
    })

    if (!workflow) {
      throw new Error('Workflow no encontrado')
    }

    // Activar/desactivar en n8n también
    try {
      if (active) {
        await n8nClient.activateWorkflow(workflow.n8nWorkflowId)
      } else {
        await n8nClient.deactivateWorkflow(workflow.n8nWorkflowId)
      }
    } catch (error) {
      console.warn('[AutomationService] No se pudo sincronizar estado con n8n:', error)
    }

    // Actualizar en Volkern
    return await prisma.n8nWorkflow.update({
      where: { id: workflowId },
      data: { activo: active, updatedAt: new Date() },
    })
  }

  /**
   * Prepara el payload reemplazando variables
   */
  private preparePayload(
    data: Record<string, any>,
    configPayload?: Record<string, any>
  ): Record<string, any> {
    if (!configPayload) return data

    const result: Record<string, any> = { ...data }

    // Mapear variables configuradas
    for (const [key, mapping] of Object.entries(configPayload)) {
      if (typeof mapping === 'string' && mapping.startsWith('{') && mapping.endsWith('}')) {
        // Es una variable de Volkern
        const varName = mapping.slice(1, -1)
        const value = this.getNestedValue(data, varName)
        if (value !== undefined) {
          result[key] = value
        }
      } else {
        result[key] = mapping
      }
    }

    return result
  }

  /**
   * Obtiene valor anidado de un objeto
   */
  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => current?.[key], obj)
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
}

// Singleton instance
export const automationService = new AutomationService()
export default automationService
