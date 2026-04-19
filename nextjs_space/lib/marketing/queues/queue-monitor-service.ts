import { Queue } from 'bullmq';
import { redisConnection } from '../../core/redis';

export class QueueMonitorService {
  private static queues: Record<string, Queue> = {};

  private static getQueue(name: string) {
    if (!this.queues[name]) {
      this.queues[name] = new Queue(`marketing:${name}`, { connection: redisConnection });
    }
    return this.queues[name];
  }

  /**
   * Obtiene el estado global de todas las colas de marketing
   */
  static async getGlobalStatus() {
    const queueNames = ['social-posts', 'campaign-emails', 'lead-nurturing'];
    const status = await Promise.all(queueNames.map(async (name) => {
      const q = this.getQueue(name);
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
        isHealthy: true // Podría expandirse con chequeos de Redis
      };
    }));

    return status;
  }

  /**
   * Reintenta un trabajo fallido
   */
  static async retryJob(queueName: string, jobId: string) {
    const q = this.getQueue(queueName);
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
