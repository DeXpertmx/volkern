/**
 * Sync Worker — BullMQ Worker para sincronización ADS
 *
 * Procesa las colas:
 *   - ads-sync-campaigns: Sincronización de estructura cada 1h
 *   - ads-sync-insights: Sincronización de métricas cada 1h
 *   - ads-sync-full: Sincronización completa cada 6h
 *
 * Sigue el mismo patrón que execution-worker.ts.
 *
 * @see PLAN_ADS_INTELLIGENCE.md — Fase 3
 */

import { Worker, Job } from 'bullmq';
import { initRedis } from '@/lib/core/redis';
import { logger } from '@/lib/logger';
import { syncAllPlatforms, syncPlatformFull } from '../sync-engine';
import type { AdsJobData } from '../cron/ads-jobs';

// ─── Constantes ──────────────────────────────────────────────────────

const QUEUE_NAME = 'ads-sync';
const CONCURRENCY = 2; // Procesar 2 plataformas simultáneamente

// ─── Worker Singleton ────────────────────────────────────────────────

let _worker: Worker<AdsJobData> | null = null;
let _initPromise: Promise<Worker<AdsJobData> | null> | null = null;

/**
 * Inicializa el worker de sincronización ADS.
 * Usa promise-based singleton para evitar race conditions.
 */
export async function initAdsSyncWorker(): Promise<Worker<AdsJobData> | null> {
  if (_worker) return _worker;
  if (_initPromise) return _initPromise;

  _initPromise = (async () => {
    const redis = await initRedis();
    if (!redis) {
      logger.warn('[AdsSyncWorker] Redis no disponible — worker desactivado');
      return null;
    }

    _worker = new Worker<AdsJobData>(
      QUEUE_NAME,
      async (job: Job<AdsJobData>) => {
        const { type, tenantId, platformId } = job.data;
        const jobId = job.id || 'unknown';

        logger.info(
          { jobId, type, tenantId, platformId },
          `[AdsSyncWorker] Procesando job: ${type}`,
        );

        try {
          switch (type) {
            case 'ads-sync-campaigns':
            case 'ads-sync-insights': {
              if (tenantId) {
                const result = await syncAllPlatforms(tenantId);
                logger.info(
                  { jobId, tenantId, duration: result.durationMs, platforms: result.platforms.length },
                  '[AdsSyncWorker] Sync de campañas completado',
                );
              } else {
                logger.warn({ jobId }, '[AdsSyncWorker] tenantId no especificado, saltando');
              }
              break;
            }

            case 'ads-sync-full': {
              if (tenantId && platformId) {
                const result = await syncPlatformFull(tenantId, platformId);
                logger.info(
                  { jobId, tenantId, platformId, success: result.success },
                  '[AdsSyncWorker] Sync completo finalizado',
                );
              } else if (tenantId) {
                const result = await syncAllPlatforms(tenantId);
                logger.info(
                  { jobId, tenantId, duration: result.durationMs },
                  '[AdsSyncWorker] Sync completo (todas plataformas) finalizado',
                );
              } else {
                logger.warn({ jobId }, '[AdsSyncWorker] tenantId no especificado para full sync');
              }
              break;
            }

            default:
              logger.warn({ jobId, type }, `[AdsSyncWorker] Tipo de job desconocido: ${type}`);
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Error desconocido';
          logger.error({ jobId, type, err }, `[AdsSyncWorker] Error procesando job: ${msg}`);
          throw err; // BullMQ reintentará según la configuración
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
      logger.info({ jobId: job.id, type: job.data.type }, '[AdsSyncWorker] Job completado');
    });

    _worker.on('failed', (job: Job<AdsJobData> | undefined, err: Error) => {
      if (job) {
        logger.error(
          { jobId: job.id, type: job.data.type, attempts: job.attemptsMade, err },
          `[AdsSyncWorker] Job falló: ${err.message}`,
        );
      } else {
        logger.error({ err }, '[AdsSyncWorker] Worker falló (job desconocido)');
      }
    });

    logger.info('[AdsSyncWorker] Worker inicializado correctamente');
    return _worker;
  })();

  return _initPromise;
}

/**
 * Detiene el worker gracefulmente.
 */
export async function stopAdsSyncWorker(): Promise<void> {
  if (_worker) {
    await _worker.close();
    _worker = null;
    _initPromise = null;
    logger.info('[AdsSyncWorker] Worker detenido');
  }
}
