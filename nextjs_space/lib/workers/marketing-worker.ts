import { Worker, Job } from 'bullmq';
import { initRedis } from '../core/redis';
import { SocialMediaService } from '../marketing/social-media-service';
import { prisma } from '../db';

/**
 * Worker para procesar publicaciones sociales y nurturing.
 * Solo se inicializa si Redis está disponible.
 */
export async function initMarketingWorkers() {
  const redis = await initRedis();
  if (!redis) {
    console.debug('[MarketingWorkers] Redis no disponible, workers omitidos.');
    return;
  }

  // Worker para publicaciones sociales
  const socialWorker = new Worker(
    'marketing-social-posts',
    async (job: Job) => {
      const { postId } = job.data;
      console.log(`[Worker] Procesando publicación social: ${postId}`);
      
      try {
        const post = await prisma.socialPost.findUnique({
          where: { id: postId }
        });

        if (!post) throw new Error('Post no encontrado');

        for (const platform of post.platforms) {
          await SocialMediaService.publishToPlatform(postId, platform as any);
        }
      } catch (error) {
        console.error(`[Worker] Error publicando post ${postId}:`, error);
        throw error;
      }
    },
    { connection: redis }
  );

  // Worker para Nutrición de Leads (Nurturing)
  const leadWorker = new Worker(
    'marketing-lead-nurturing',
    async (job: Job) => {
      console.log(`[Worker] Procesando nurturing para:`, job.data);
    },
    { connection: redis }
  );

  const handleWorkerError = (name: string, err: any) => {
    if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND') return;
    console.error(`[Worker] ${name} Error:`, err);
  };

  socialWorker.on('completed', (job) => console.log(`[Worker] Job ${job.id} completado`));
  socialWorker.on('failed', (job, err) => console.error(`[Worker] Job ${job?.id} falló:`, err));
  socialWorker.on('error', (err) => handleWorkerError('Social', err));
  leadWorker.on('error', (err) => handleWorkerError('Lead', err));

  console.log('✅ [MarketingWorkers] Workers inicializados.');
}
