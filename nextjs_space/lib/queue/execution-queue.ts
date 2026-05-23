/**
 * Execution Queue — BullMQ implementation
 *
 * Cola de trabajos basada en BullMQ para ejecuciones de automatizaciones,
 * workflows externos, webhooks, y emails.
 *
 * Redis se usa como backend de la cola. La tabla automationExecutionLog
 * se conserva únicamente como histórico de auditoría (ya no como tabla de cola).
 */

import { Queue, type JobsOptions } from 'bullmq';
import { initRedis } from '@/lib/core/redis';
import { logger } from '@/lib/logger';

// ─── Config ─────────────────────────────────────────────────

const QUEUE_NAME = 'execution-queue';

const DEFAULT_JOB_OPTIONS: JobsOptions = {
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 2000,
  },
  removeOnComplete: {
    age: 7 * 24 * 60 * 60, // 7 días
    count: 1000,
  },
  removeOnFail: {
    age: 30 * 24 * 60 * 60, // 30 días
    count: 5000,
  },
};

// ─── Singleton (promise-based, thread-safe) ──────────────────

let _queue: Queue | null = null;
let _initPromise: Promise<Queue | null> | null = null;

/**
 * Inicializa la cola de ejecución BullMQ.
 * Usa promise-based singleton para evitar race conditions.
 * Devuelve null si Redis no está disponible (graceful degradation).
 */
export async function initExecutionQueue(): Promise<Queue | null> {
  if (_queue) return _queue;
  if (_initPromise) return _initPromise;

  _initPromise = (async () => {
    const redis = await initRedis();
    if (!redis) {
      logger.warn('[ExecutionQueue] Redis no disponible — cola desactivada');
      return null;
    }

    _queue = new Queue(QUEUE_NAME, {
      connection: redis,
      defaultJobOptions: DEFAULT_JOB_OPTIONS,
    });

    _queue.on('error', (err: Error) => {
      if ((err as any)?.code === 'ECONNREFUSED' || (err as any)?.code === 'ENOTFOUND') return;
      logger.error({ err }, '[ExecutionQueue] Queue error');
    });

    logger.info('[ExecutionQueue] Cola BullMQ inicializada correctamente');
    return _queue;
  })();

  return _initPromise;
}

/**
 * Devuelve la instancia de la cola (sin inicializar).
 */
export function getExecutionQueue(): Queue | null {
  return _queue;
}

/**
 * Cierra la cola de forma graceful y limpia el estado.
 */
export async function stopExecutionQueue(): Promise<void> {
  if (_queue) {
    await _queue.close();
    _queue = null;
  }
  _initPromise = null;
}

/**
 * Encola un trabajo en la cola de ejecución.
 *
 * @returns jobId (string) o null si Redis no está disponible
 */
export async function enqueueExecution(params: {
  tenantId: string;
  type: 'automation' | 'n8n_workflow' | 'webhook' | 'email';
  targetId: string;
  payload: Record<string, unknown>;
  priority?: number;
  maxAttempts?: number;
  delayMs?: number;
}): Promise<string | null> {
  const queue = await initExecutionQueue();
  if (!queue) return null;

  const {
    tenantId,
    type,
    targetId,
    payload,
    priority = 5,
    maxAttempts = 3,
    delayMs = 0,
  } = params;

  const job = await queue.add(
    type,
    {
      tenantId,
      type,
      targetId,
      payload,
    },
    {
      priority,
      attempts: maxAttempts,
      delay: delayMs,
      jobId: `exec_${type}_${targetId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    },
  );

  logger.info(
    { tenantId, type, targetId, jobId: job.id },
    '[ExecutionQueue] Job enqueued',
  );

  return job.id ?? null;
}

/**
 * Obtiene estadísticas de la cola.
 */
export async function getQueueStats(): Promise<{
  waiting: number;
  active: number;
  failed: number;
  completed: number;
  delayed: number;
}> {
  const queue = await initExecutionQueue();
  if (!queue) {
    return { waiting: 0, active: 0, failed: 0, completed: 0, delayed: 0 };
  }

  const counts = await queue.getJobCounts(
    'waiting',
    'active',
    'failed',
    'completed',
    'delayed',
  );

  return {
    waiting: counts.waiting ?? 0,
    active: counts.active ?? 0,
    failed: counts.failed ?? 0,
    completed: counts.completed ?? 0,
    delayed: counts.delayed ?? 0,
  };
}

/**
 * Limpia trabajos completados/fallidos antiguos.
 */
export async function cleanQueue(olderThanMs: number = 7 * 24 * 60 * 60 * 1000): Promise<number> {
  const queue = await initExecutionQueue();
  if (!queue) return 0;

  let total = 0;

  // Limpiar completados
  const completedCleaned = await queue.clean(olderThanMs, 1000, 'completed');
  total += completedCleaned.length;

  // Limpiar fallidos
  const failedCleaned = await queue.clean(olderThanMs, 1000, 'failed');
  total += failedCleaned.length;

  logger.info({ cleaned: total }, '[ExecutionQueue] Clean completed');
  return total;
}

export default {
  initExecutionQueue,
  getExecutionQueue,
  enqueueExecution,
  getQueueStats,
  cleanQueue,
};
