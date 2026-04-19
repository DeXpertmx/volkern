import { Worker, Job } from 'bullmq';
import { redisConnection } from '../core/redis';
import { SocialMediaService } from '../marketing/social-media-service';

/**
 * Worker para procesar publicaciones sociales
 */
export const socialWorker = new Worker(
  'marketing:social-posts',
  async (job: Job) => {
    const { postId } = job.data;
    console.log(`[Worker] Procesando publicación social: ${postId}`);
    
    try {
      await SocialMediaService.publishToLinkedIn(postId);
      // Aquí se podrían añadir más plataformas (YouTube, TikTok)
    } catch (error) {
      console.error(`[Worker] Error publicando post ${postId}:`, error);
      throw error;
    }
  },
  { connection: redisConnection }
);

/**
 * Worker para Nutrición de Leads (Nurturing)
 */
export const leadWorker = new Worker(
  'marketing:lead-nurturing',
  async (job: Job) => {
    // Lógica para enviar emails secuenciales, etc.
    console.log(`[Worker] Procesando nurturing para:`, job.data);
  },
  { connection: redisConnection }
);

socialWorker.on('completed', (job) => console.log(`[Worker] Job ${job.id} completado`));
socialWorker.on('failed', (job, err) => console.error(`[Worker] Job ${job?.id} falló:`, err));
