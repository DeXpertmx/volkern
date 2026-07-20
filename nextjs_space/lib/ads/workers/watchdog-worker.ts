/**
 * Watchdog Worker — BullMQ Worker para evaluación de reglas watchdog
 *
 * Procesa la cola:
 *   - ads-watchdog-evaluate: Evaluar reglas de auto-apagado cada 30min
 *
 * Sigue el mismo patrón que execution-worker.ts y sync-worker.ts.
 *
 * @see PLAN_ADS_INTELLIGENCE.md — Fase 3 y 4
 */

import { Worker, Job } from 'bullmq';
import { initRedis } from '@/lib/core/redis';
import { logger } from '@/lib/logger';
import { BudgetWatchdog } from '../budget-watchdog';
import type { AdsJobData } from '../cron/ads-jobs';

// ─── Constantes ──────────────────────────────────────────────────────

const QUEUE_NAME = 'ads-watchdog';
const CONCURRENCY = 1; // Evaluar reglas secuencialmente para evitar condiciones de carrera

// ─── Worker Singleton ────────────────────────────────────────────────

let _worker: Worker<AdsJobData> | null = null;
let _initPromise: Promise<Worker<AdsJobData> | null> | null = null;

/**
 * Inicializa el worker de watchdog ADS.
 * Usa promise-based singleton para evitar race conditions.
 */
export async function initAdsWatchdogWorker(): Promise<Worker<AdsJobData> | null> {
  if (_worker) return _worker;
  if (_initPromise) return _initPromise;

  _initPromise = (async () => {
    const redis = await initRedis();
    if (!redis) {
      logger.warn('[AdsWatchdogWorker] Redis no disponible — worker desactivado');
      return null;
    }

    _worker = new Worker<AdsJobData>(
      QUEUE_NAME,
      async (job: Job<AdsJobData>) => {
        const { tenantId } = job.data;
        const jobId = job.id || 'unknown';

        logger.info(
          { jobId, tenantId },
          '[AdsWatchdogWorker] Evaluando reglas watchdog',
        );

        try {
          if (!tenantId) {
            // Si no hay tenantId, evaluar todos los tenants activos
            const { prisma } = await import('@/lib/db');
            const tenants = await prisma.adPlatformConnection.findMany({
              where: { status: 'CONNECTED' },
              select: { tenantId: true },
              distinct: ['tenantId'],
            });

            for (const t of tenants) {
              await evaluateTenantRules(t.tenantId);
            }
          } else {
            await evaluateTenantRules(tenantId);
          }

          logger.info({ jobId }, '[AdsWatchdogWorker] Evaluación watchdog completada');
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Error desconocido';
          logger.error({ jobId, err }, `[AdsWatchdogWorker] Error: ${msg}`);
          throw err;
        }
      },
      {
        connection: redis,
        concurrency: CONCURRENCY,
        removeOnComplete: { age: 7 * 24 * 60 * 60, count: 500 },
        removeOnFail: { age: 14 * 24 * 60 * 60, count: 200 },
      },
    );

    _worker.on('completed', (job: Job<AdsJobData>) => {
      logger.info({ jobId: job.id }, '[AdsWatchdogWorker] Evaluación completada');
    });

    _worker.on('failed', (job: Job<AdsJobData> | undefined, err: Error) => {
      if (job) {
        logger.error(
          { jobId: job.id, attempts: job.attemptsMade, err },
          `[AdsWatchdogWorker] Evaluación falló: ${err.message}`,
        );
      }
    });

    logger.info('[AdsWatchdogWorker] Worker inicializado correctamente');
    return _worker;
  })();

  return _initPromise;
}

/**
 * Evalúa las reglas watchdog para un tenant específico usando BudgetWatchdog.
 */
async function evaluateTenantRules(tenantId: string): Promise<void> {
  try {
    const evaluations = await BudgetWatchdog.evaluateAll(tenantId);
    const triggered = evaluations.filter(e => e.triggered);

    logger.info(
      { tenantId, total: evaluations.length, triggered: triggered.length },
      '[AdsWatchdogWorker] Evaluación watchdog completada',
    );

    if (triggered.length > 0) {
      logger.info(
        { tenantId, triggered: triggered.map(e => ({ ruleId: e.ruleId, ruleName: e.ruleName, action: e.action })) },
        '[AdsWatchdogWorker] Reglas disparadas',
      );
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error desconocido';
    logger.error({ tenantId, err }, `[AdsWatchdogWorker] Error evaluando reglas: ${msg}`);
  }
}

/**
 * Detiene el worker gracefulmente.
 */
export async function stopAdsWatchdogWorker(): Promise<void> {
  if (_worker) {
    await _worker.close();
    _worker = null;
    _initPromise = null;
    logger.info('[AdsWatchdogWorker] Worker detenido');
  }
}
