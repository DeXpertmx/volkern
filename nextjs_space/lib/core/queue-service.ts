import { Queue, Worker, Job } from 'bullmq';
import { initRedis, getRedisConnection } from './redis';

// Estado de las colas
let queuesInitialized = false;

type MarketingQueueName = 'SOCIAL_POSTS' | 'CAMPAIGN_EMAILS' | 'LEAD_NURTURING';

// Instancias lazy de las colas
const queueInstances: Partial<Record<MarketingQueueName, Queue>> = {};

const QUEUE_NAMES: Record<MarketingQueueName, string> = {
  SOCIAL_POSTS: 'marketing-social-posts',
  CAMPAIGN_EMAILS: 'marketing-campaign-emails',
  LEAD_NURTURING: 'marketing-lead-nurturing',
};

/**
 * Inicializa las colas de marketing si Redis está disponible.
 * Llamar desde el Skills Layer al inicio del servidor.
 */
export async function initMarketingQueues(): Promise<boolean> {
  if (queuesInitialized) return true;

  const redis = await initRedis();
  if (!redis) {
    console.warn('⚠️ [Queues] Colas de marketing desactivadas (Redis no disponible).');
    return false;
  }

  for (const [key, name] of Object.entries(QUEUE_NAMES)) {
    const queue = new Queue(name, { connection: redis });
    queue.on('error', (err: any) => {
      if (err.code !== 'ECONNREFUSED') console.error(`[Queue:${name}] Error:`, err);
    });
    queueInstances[key as MarketingQueueName] = queue;
  }

  queuesInitialized = true;
  console.log('✅ [Queues] Colas de marketing inicializadas correctamente.');
  return true;
}

/**
 * Encola una tarea de marketing (no-op silencioso si Redis no está disponible)
 */
export const queueMarketingTask = async (
  queueName: MarketingQueueName,
  jobName: string,
  data: any,
  options: { delay?: number; priority?: number } = {}
) => {
  const queue = queueInstances[queueName];
  if (!queue) {
    // Redis no disponible — log de debug silencioso
    if (process.env.NODE_ENV === 'development') {
      console.debug(`[Queue] Tarea "${jobName}" ignorada (Redis no disponible).`);
    }
    return null;
  }

  return await queue.add(jobName, data, {
    ...options,
    attempts: 5,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: true,
    removeOnFail: false,
  });
};

// Exportar referencia a las colas para el monitor (compatibilidad)
export const marketingQueues = new Proxy({} as Record<MarketingQueueName, Queue>, {
  get(_, prop: string) {
    return queueInstances[prop as MarketingQueueName] || null;
  }
});
