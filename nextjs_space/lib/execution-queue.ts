/**
 * Execution Queue — Fachada BullMQ
 *
 * Mantiene la misma API pública que la implementación anterior basada en tabla,
 * pero delega el encolado y procesamiento a BullMQ.
 *
 * La tabla automationExecutionLog se conserva únicamente como
 * histórico de auditoría (el worker escribe los logs).
 */

import { logger } from './logger';
import {
  initExecutionQueue,
  stopExecutionQueue,
  enqueueExecution,
  getQueueStats,
  cleanQueue,
} from './queue/execution-queue';
import {
  initExecutionWorker,
  stopExecutionWorker,
} from './queue/execution-worker';

export type QueuedExecutionStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'retry';

export interface QueueItemData {
  queuedAt: string;
  tenantId: string;
  targetId: string;
  payload: Record<string, unknown>;
  priority: number;
  maxAttempts: number;
  attempts: number;
  nextRetryAt: string | null;
  lastError?: string;
}

export interface QueueItem {
  id: string;
  nodeId: string;
  nodeType: string;
  status: string;
  message: string | null;
  data: QueueItemData | null;
  fechaCreacion: Date;
}

export interface QueuedExecution {
  id: string;
  tenantId: string;
  type: 'automation' | 'n8n_workflow' | 'webhook' | 'email';
  targetId: string;
  payload: Record<string, unknown>;
  status: QueuedExecutionStatus;
  attempts: number;
  maxAttempts: number;
  nextRetryAt: Date | null;
  lastError: string | null;
  priority: number;
  createdAt: Date;
  updatedAt: Date;
}

class ExecutionQueueManager {
  private _initialized = false;
  private _shutdownRegistered = false;

  /**
   * Inicializa la cola y el worker BullMQ.
   * Se llama automáticamente en el primer uso.
   */
  private async ensureInit(): Promise<void> {
    if (this._initialized) return;
    this._initialized = true;

    await initExecutionQueue();
    await initExecutionWorker();

    // Registrar shutdown handler global una sola vez
    if (!this._shutdownRegistered) {
      this._shutdownRegistered = true;
      const shutdown = () => this.shutdown();
      process.on('SIGTERM', shutdown);
      process.on('SIGINT', shutdown);
    }
  }

  /**
   * Cierra gracefulmente la cola y el worker BullMQ.
   * Libera conexiones Redis. Llamar en SIGTERM/SIGINT o al hacer deploy.
   */
  async shutdown(): Promise<void> {
    logger.info('[Queue] Shutting down execution queue...');
    await stopExecutionWorker();
    await stopExecutionQueue();
    logger.info('[Queue] Execution queue shut down');
  }

  /**
   * Encola una nueva ejecución en BullMQ.
   */
  async enqueue(params: {
    tenantId: string;
    type: QueuedExecution['type'];
    targetId: string;
    payload: Record<string, unknown>;
    priority?: number;
    maxAttempts?: number;
    delayMs?: number;
  }): Promise<string> {
    await this.ensureInit();

    const jobId = await enqueueExecution({
      tenantId: params.tenantId,
      type: params.type,
      targetId: params.targetId,
      payload: params.payload,
      priority: params.priority,
      maxAttempts: params.maxAttempts,
      delayMs: params.delayMs,
    });

    if (!jobId) {
      // Fallback: si Redis no está disponible, generar un ID local
      const fallbackId = `local_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      logger.warn(
        { fallbackId, ...params },
        '[Queue] Redis no disponible — usando ID local (sin cola real)',
      );
      return fallbackId;
    }

    return jobId;
  }

  /**
   * Procesa la cola — BullMQ lo hace automáticamente.
   * Este método se mantiene para compatibilidad. Retorna las stats actuales
   * en lugar de ceros para que el endpoint POST /api/internal/queue
   * siga siendo informativo.
   */
  async processQueue(): Promise<{ processed: number; failed: number }> {
    await this.ensureInit();
    const stats = await getQueueStats();
    logger.debug(
      { waiting: stats.waiting, active: stats.active, failed: stats.failed, completed: stats.completed },
      '[Queue] processQueue() — BullMQ gestiona el procesamiento automáticamente',
    );
    return { processed: stats.completed, failed: stats.failed };
  }

  /**
   * Obtiene estadísticas de la cola desde BullMQ.
   */
  async getStats(): Promise<{
    pending: number;
    processing: number;
    failed: number;
    completed: number;
  }> {
    await this.ensureInit();

    const stats = await getQueueStats();

    // Mapear nombres BullMQ a la API legacy
    return {
      pending: stats.waiting + stats.delayed,
      processing: stats.active,
      failed: stats.failed,
      completed: stats.completed,
    };
  }

  /**
   * Limpia trabajos completados/fallidos antiguos en BullMQ.
   */
  async cleanup(olderThanDays: number = 7): Promise<number> {
    await this.ensureInit();

    const deleted = await cleanQueue(olderThanDays * 24 * 60 * 60 * 1000);
    return deleted;
  }
}

export const executionQueue = new ExecutionQueueManager();

// Exponer shutdown para uso externo (ej. health check, testing)
export async function shutdownExecutionQueue(): Promise<void> {
  await executionQueue.shutdown();
}
