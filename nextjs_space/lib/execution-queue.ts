/**
 * Execution Queue
 * Sistema de cola para ejecuciones de workflows con reintentos avanzados
 */

import { prisma, getTenantDb, dbContext } from './db'

export type QueuedExecutionStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'retry'

export interface QueuedExecution {
  id: string
  tenantId: string
  type: 'automation' | 'n8n_workflow' | 'webhook' | 'email'
  targetId: string // automationId, workflowId, etc.
  payload: Record<string, any>
  status: QueuedExecutionStatus
  attempts: number
  maxAttempts: number
  nextRetryAt: Date | null
  lastError: string | null
  priority: number
  createdAt: Date
  updatedAt: Date
}

const RETRY_DELAYS = [1000, 5000, 15000, 30000, 60000] // Backoff exponencial
const MAX_CONCURRENT_EXECUTIONS = 10

class ExecutionQueueManager {
  private isProcessing = false
  private processingIds = new Set<string>()

  /**
   * Encola una nueva ejecución
   */
  async enqueue(params: {
    tenantId: string
    type: QueuedExecution['type']
    targetId: string
    payload: Record<string, any>
    priority?: number
    maxAttempts?: number
    delayMs?: number
  }): Promise<string> {
    const { tenantId, type, targetId, payload, priority = 5, maxAttempts = 3, delayMs = 0 } = params

    const nextRetryAt = delayMs > 0 ? new Date(Date.now() + delayMs) : null

    const tenantClient = await getTenantDb(tenantId)

    const execution = await dbContext.run(
      { tenantId, client: tenantClient },
      async () => {
        return tenantClient.automationExecutionLog.create({
          data: {
            executionId: `queue_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            nodeId: `queue_${type}`,
            nodeType: type,
            status: 'pending',
            message: `Enqueued: ${targetId}`,
            data: {
              queuedAt: new Date().toISOString(),
              tenantId,
              targetId,
              payload,
              priority,
              maxAttempts,
              attempts: 0,
              nextRetryAt: nextRetryAt?.toISOString() || null,
            },
          },
        })
      }
    )

    console.log(`[Queue] Enqueued ${type}: ${targetId} (id: ${execution.id})`)
    return execution.id
  }

  /**
   * Procesa la cola de ejecuciones pendientes
   */
  async processQueue(): Promise<{ processed: number; failed: number }> {
    if (this.isProcessing) {
      console.log('[Queue] Already processing')
      return { processed: 0, failed: 0 }
    }

    this.isProcessing = true
    let processed = 0
    let failed = 0

    try {
      // Get all tenants to check their queues
      const { globalPrisma } = await import('./db')
      const tenants = await globalPrisma.tenant.findMany({ select: { id: true } })

      for (const tenant of tenants) {
        const tenantClient = await getTenantDb(tenant.id)

        const pendingItems = await dbContext.run(
          { tenantId: tenant.id, client: tenantClient },
          async () => {
            return tenantClient.automationExecutionLog.findMany({
              where: {
                nodeId: { startsWith: 'queue_' },
                status: 'pending',
              },
              orderBy: { fechaCreacion: 'asc' },
              take: MAX_CONCURRENT_EXECUTIONS,
            })
          }
        )

        for (const item of pendingItems) {
          if (this.processingIds.has(item.id)) continue
          this.processingIds.add(item.id)

          try {
            const queueData = item.data as any
            const nextRetryAt = queueData?.nextRetryAt ? new Date(queueData.nextRetryAt) : null
            
            if (nextRetryAt && nextRetryAt > new Date()) {
              this.processingIds.delete(item.id)
              continue
            }

            await dbContext.run(
              { tenantId: tenant.id, client: tenantClient },
              async () => {
                await tenantClient.automationExecutionLog.update({
                  where: { id: item.id },
                  data: { status: 'success' },
                })
              }
            )

            const result = await this.executeItem(item, tenant.id)
            
            if (result.success) {
              processed++
            } else {
              failed++
              await this.handleRetry(item, tenant.id, result.error || 'Unknown error')
            }
          } catch (error: any) {
            console.error(`[Queue] Error processing ${item.id}:`, error)
            failed++
            await this.handleRetry(item, tenant.id, error.message)
          } finally {
            this.processingIds.delete(item.id)
          }
        }
      }
    } finally {
      this.isProcessing = false
    }

    return { processed, failed }
  }

  private async executeItem(item: any, tenantId: string): Promise<{ success: boolean; error?: string }> {
    const queueData = item.data as any
    const { targetId, payload, type } = queueData

    switch (item.nodeType || type) {
      case 'n8n_workflow': {
        const { automationService } = await import('./automation-service')
        const result = await automationService.executeExternalWorkflow(targetId, {
          tenantId,
          trigger: 'queue_execution',
          payload,
        })
        return { success: result.success, error: result.error }
      }

      case 'webhook': {
        try {
          const response = await fetch(targetId, {
            method: payload.method || 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...payload.headers,
            },
            body: JSON.stringify(payload.body || payload),
          })
          return { success: response.ok, error: response.ok ? undefined : `HTTP ${response.status}` }
        } catch (error: any) {
          return { success: false, error: error.message }
        }
      }

      case 'automation': {
        const { triggerAutomation } = await import('./automation-engine')
        try {
          await triggerAutomation(payload.trigger || 'manual', {
            tenantId,
            ...payload,
          })
          return { success: true }
        } catch (error: any) {
          return { success: false, error: error.message }
        }
      }

      default:
        return { success: false, error: `Unknown type: ${item.nodeType}` }
    }
  }

  private async handleRetry(item: any, tenantId: string, error: string): Promise<void> {
    const queueData = item.data as any
    const attempts = (queueData.attempts || 0) + 1
    const maxAttempts = queueData.maxAttempts || 3

    const tenantClient = await getTenantDb(tenantId)

    if (attempts >= maxAttempts) {
      await dbContext.run(
        { tenantId, client: tenantClient },
        async () => {
          await tenantClient.automationExecutionLog.update({
            where: { id: item.id },
            data: {
              status: 'error',
              message: `Failed after ${attempts} attempts: ${error}`,
            },
          })
        }
      )
      console.log(`[Queue] Item ${item.id} failed permanently after ${attempts} attempts`)
      return
    }

    const delayMs = RETRY_DELAYS[Math.min(attempts, RETRY_DELAYS.length - 1)]
    const nextRetryAt = new Date(Date.now() + delayMs)

    await dbContext.run(
      { tenantId, client: tenantClient },
      async () => {
        await tenantClient.automationExecutionLog.create({
          data: {
            executionId: `retry_${item.id}_${attempts}`,
            nodeId: item.nodeId,
            nodeType: item.nodeType,
            status: 'pending',
            message: `Retry ${attempts}/${maxAttempts}: ${error}`,
            data: {
              ...queueData,
              attempts,
              lastError: error,
              nextRetryAt: nextRetryAt.toISOString(),
            },
          },
        })
      }
    )

    console.log(`[Queue] Scheduled retry ${attempts}/${maxAttempts} for ${item.id} at ${nextRetryAt}`)
  }

  /**
   * Obtiene estadísticas de la cola
   */
  async getStats(): Promise<{
    pending: number
    processing: number
    failed: number
    completed: number
  }> {
    const [pending, failed] = await Promise.all([
      prisma.automationExecutionLog.count({
        where: {
          nodeId: { startsWith: 'queue_' },
          status: 'pending',
        },
      }),
      prisma.automationExecutionLog.count({
        where: {
          nodeId: { startsWith: 'queue_' },
          status: 'error',
          fechaCreacion: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }, // Últimas 24h
        },
      }),
    ])

    return {
      pending,
      processing: this.processingIds.size,
      failed,
      completed: 0, // Calcular si es necesario
    }
  }

  /**
   * Limpia ejecuciones antiguas
   */
  async cleanup(olderThanDays: number = 7): Promise<number> {
    const cutoffDate = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000)
    
    const result = await prisma.automationExecutionLog.deleteMany({
      where: {
        nodeId: { startsWith: 'queue_' },
        fechaCreacion: { lt: cutoffDate },
        status: { in: ['success', 'error'] },
      },
    })

    return result.count
  }
}

export const executionQueue = new ExecutionQueueManager()
