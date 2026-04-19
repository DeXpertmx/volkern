import { Queue, Worker, Job } from 'bullmq';
import { redisConnection } from './redis';

// Definición de las colas principales del Hub de Marketing
export const marketingQueues = {
  SOCIAL_POSTS: new Queue('marketing:social-posts', { connection: redisConnection }),
  CAMPAIGN_EMAILS: new Queue('marketing:campaign-emails', { connection: redisConnection }),
  LEAD_NURTURING: new Queue('marketing:lead-nurturing', { connection: redisConnection }),
};

/**
 * Servicio para encolar tareas de marketing
 */
export const queueMarketingTask = async (
  queueName: keyof typeof marketingQueues,
  jobName: string,
  data: any,
  options: { delay?: number; priority?: number } = {}
) => {
  const queue = marketingQueues[queueName];
  return await queue.add(jobName, data, {
    ...options,
    attempts: 5,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
    removeOnComplete: true,
    removeOnFail: false,
  });
};

// Log de eventos de la cola (Opcional, para monitoreo)
marketingQueues.SOCIAL_POSTS.on('error', (err) => console.error('Social Posts Queue Error:', err));
marketingQueues.CAMPAIGN_EMAILS.on('error', (err) => console.error('Campaign Emails Queue Error:', err));
marketingQueues.LEAD_NURTURING.on('error', (err) => console.error('Lead Nurturing Queue Error:', err));
