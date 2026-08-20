/**
 * Execution Worker — BullMQ Worker
 *
 * Procesa los trabajos de la cola de ejecución (automatizaciones,
 * workflows externos, webhooks, emails).
 *
 * Escribe en automationExecutionLog como histórico de auditoría.
 */

import { Worker, Job } from 'bullmq';
import { initRedis } from '@/lib/core/redis';
import { getTenantDb, dbContext } from '@/lib/db';
import { logger } from '@/lib/logger';

// ─── Tipos ──────────────────────────────────────────────────

export interface ExecutionJobData {
  tenantId: string;
  type: 'automation' | 'n8n_workflow' | 'webhook' | 'email';
  targetId: string;
  payload: Record<string, unknown>;
}

const QUEUE_NAME = 'execution-queue';

// ─── Worker singleton (promise-based, thread-safe) ──────────

let _worker: Worker<ExecutionJobData> | null = null;
let _initPromise: Promise<Worker<ExecutionJobData> | null> | null = null;

/**
 * Inicializa el worker de la cola de ejecución.
 * Solo debe llamarse una vez al arrancar el servidor.
 * Usa promise-based singleton para evitar race conditions.
 */
export async function initExecutionWorker(): Promise<Worker<ExecutionJobData> | null> {
  if (_worker) return _worker;
  if (_initPromise) return _initPromise;

  _initPromise = (async () => {
    const redis = await initRedis();
    if (!redis) {
      logger.warn('[ExecutionWorker] Redis no disponible — worker desactivado');
      return null;
    }

    _worker = new Worker<ExecutionJobData>(
      QUEUE_NAME,
      async (job: Job<ExecutionJobData>) => {
        const { tenantId, type, targetId, payload } = job.data;

        logger.info(
          { jobId: job.id, tenantId, type, targetId, attempt: job.attemptsMade + 1 },
          '[ExecutionWorker] Processing job',
        );

        // Registrar en automationExecutionLog como histórico
        await writeExecutionLog({
          tenantId,
          executionId: job.id ?? `job_${Date.now()}`,
          nodeType: type,
          status: 'processing',
          message: `Processing: ${targetId}`,
          data: {
            tenantId,
            targetId,
            payload,
            attempts: job.attemptsMade,
            maxAttempts: job.opts?.attempts ?? 3,
          },
        });

        try {
          await executeJob(type, targetId, payload, tenantId);

          // Marcar como completado en el log
          await writeExecutionLog({
            tenantId,
            executionId: job.id ?? `job_${Date.now()}`,
            nodeType: type,
            status: 'success',
            message: `Completed: ${targetId}`,
            data: {
              tenantId,
              targetId,
              payload,
              attempts: job.attemptsMade + 1,
              maxAttempts: job.opts?.attempts ?? 3,
            },
          });
        } catch (error: unknown) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          const isLastAttempt = job.attemptsMade + 1 >= (job.opts?.attempts ?? 3);

          // Registrar fallo
          await writeExecutionLog({
            tenantId,
            executionId: job.id ?? `job_${Date.now()}`,
            nodeType: type,
            status: isLastAttempt ? 'error' : 'retry',
            message: isLastAttempt
              ? `Failed permanently after ${job.attemptsMade + 1} attempts: ${errorMessage}`
              : `Retry ${job.attemptsMade + 1}/${job.opts?.attempts}: ${errorMessage}`,
            data: {
              tenantId,
              targetId,
              payload,
              attempts: job.attemptsMade + 1,
              maxAttempts: job.opts?.attempts ?? 3,
              lastError: errorMessage,
            },
          });

          // Relanzar para que BullMQ maneje el reintento
          throw error;
        }
      },
      {
        connection: redis,
        concurrency: 10,
        lockDuration: 60_000,
        stalledInterval: 30_000,
        maxStalledCount: 3,
      },
    );

    _worker.on('completed', (job) => {
      logger.info({ jobId: job.id }, '[ExecutionWorker] Job completed');
    });

    _worker.on('failed', (job, error) => {
      if (job) {
        logger.error(
          { jobId: job.id, err: error, attempt: job.attemptsMade },
          '[ExecutionWorker] Job failed',
        );
      }
    });

    _worker.on('error', (err: Error) => {
      if ((err as any)?.code === 'ECONNREFUSED' || (err as any)?.code === 'ENOTFOUND') return;
      logger.error({ err }, '[ExecutionWorker] Worker error');
    });

    logger.info('[ExecutionWorker] Worker BullMQ inicializado correctamente');
    return _worker;
  })();

  return _initPromise;
}

/**
 * Detiene el worker de forma graceful.
 */
export async function stopExecutionWorker(): Promise<void> {
  if (_worker) {
    await _worker.close();
    _worker = null;
  }
  _initPromise = null;
  logger.info('[ExecutionWorker] Worker detenido');
}

/**
 * Devuelve la instancia del worker.
 */
export function getExecutionWorker(): Worker<ExecutionJobData> | null {
  return _worker;
}

// ─── Job executor ───────────────────────────────────────────

async function executeJob(
  type: ExecutionJobData['type'],
  targetId: string,
  payload: Record<string, unknown>,
  tenantId: string,
): Promise<void> {
  switch (type) {
    case 'n8n_workflow': {
      const { automationService } = await import('@/lib/automation-service');
      const result = await automationService.executeExternalWorkflow(targetId, {
        tenantId,
        trigger: 'queue_execution',
        payload,
      });
      if (!result.success) {
        throw new Error(result.error ?? 'n8n workflow execution failed');
      }
      break;
    }

    case 'webhook': {
      const method = (payload.method as string) || 'POST';
      const response = await fetch(targetId, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(payload.headers as Record<string, string> | undefined),
        },
        body: JSON.stringify(payload.body || payload),
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) {
        throw new Error(`Webhook responded with HTTP ${response.status}`);
      }
      break;
    }

    case 'automation': {
      const { executeAutomationsSync } = await import('@/lib/automation-engine');
      const trigger = (payload.trigger as string) || 'manual';
      await executeAutomationsSync(trigger, {
        tenantId,
        ...payload,
      });
      break;
    }

    case 'email': {
      logger.info({ targetId }, '[ExecutionWorker] Email job — processed by campaign engine');
      break;
    }

    default: {
      throw new Error(`Unknown job type: ${type}`);
    }
  }
}

// ─── Log writer ─────────────────────────────────────────────

interface LogEntry {
  tenantId: string;
  executionId: string;
  nodeType: string;
  status: string;
  message: string;
  data: Record<string, unknown>;
}

async function writeExecutionLog(entry: LogEntry): Promise<void> {
  try {
    const tenantClient = await getTenantDb(entry.tenantId);

    await dbContext.run(
      { tenantId: entry.tenantId, client: tenantClient },
      async () => {
        // AutomationExecutionLog tiene FK a AutomationExecution. Para jobs de
        // automatización el motor crea su propia ejecución con un id distinto
        // al del job; si no existe la ejecución con este id, no hay nada que
        // auditar aquí (el log del motor es el registro real) y evitamos el
        // ruido de violaciones de FK en los logs.
        const exists = await tenantClient.automationExecution.findUnique({
          where: { id: entry.executionId },
          select: { id: true },
        });
        if (!exists) return;

        await tenantClient.automationExecutionLog.create({
          data: {
            executionId: entry.executionId,
            nodeId: `queue_${entry.nodeType}`,
            nodeType: entry.nodeType,
            status: entry.status,
            message: entry.message,
            data: entry.data as any,
          },
        });
      },
    );
  } catch (error: unknown) {
    logger.error({ err: error }, '[ExecutionWorker] Failed to write execution log');
  }
}

export default {
  initExecutionWorker,
  stopExecutionWorker,
  getExecutionWorker,
};
