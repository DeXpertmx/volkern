import { Queue } from 'bullmq';
import { initRedis } from '../../core/redis';

export class QueueMonitorService {
  private static queues: Record<string, Queue> = {};
  private static initialized = false;

  /**
   * Inicializa el monitor solo si Redis está disponible
   */
  static async init(): Promise<void> {
    if (this.initialized) return;
    const redis = await initRedis();
    if (!redis) return;

    const queueNames = ['social-posts', 'campaign-emails', 'lead-nurturing'];
    for (const name of queueNames) {
      const queue = new Queue(`marketing_${name}`, { connection: redis });
      queue.on('error', (err: any) => {
        if (err.code !== 'ECONNREFUSED') console.error(`[QueueMonitor:${name}] Error:`, err);
      });
      this.queues[name] = queue;
    }
    this.initialized = true;
  }

  private static getQueue(name: string): Queue | null {
    return this.queues[name] || null;
  }

  /**
   * Obtiene el estado global de todas las colas de marketing
   */
  static async getGlobalStatus() {
    if (!this.initialized) return [];

    const queueNames = ['social-posts', 'campaign-emails', 'lead-nurturing'];
    const status = await Promise.all(queueNames.map(async (name) => {
      const q = this.getQueue(name);
      if (!q) return { name, counts: {}, isHealthy: false };

      const [waiting, active, completed, failed, delayed] = await Promise.all([
        q.getWaitingCount(),
        q.getActiveCount(),
        q.getCompletedCount(),
        q.getFailedCount(),
        q.getDelayedCount(),
      ]);

      return {
        name,
        counts: { waiting, active, completed, failed, delayed },
        isHealthy: true
      };
    }));

    return status;
  }

  /**
   * Reintenta un trabajo fallido
   */
  static async retryJob(queueName: string, jobId: string) {
    const q = this.getQueue(queueName);
    if (!q) throw new Error('Cola no inicializada (Redis no disponible)');
    const job = await q.getJob(jobId);
    if (!job) throw new Error('Trabajo no encontrado');
    await job.retry();
    return { success: true };
  }

  /**
   * Obtiene detalles de los últimos errores
   */
  static async getFailedJobs(queueName: string, limit = 10) {
    const q = this.getQueue(queueName);
    if (!q) return [];
    const failed = await q.getFailed(0, limit);
    return failed.map(j => ({
      id: j.id,
      name: j.name,
      data: j.data,
      failedReason: j.failedReason,
      timestamp: j.timestamp,
      finishedOn: j.finishedOn,
    }));
  }
}
