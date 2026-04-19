import cron from 'node-cron';
import { prisma } from '../db';
import { SocialMediaService } from '../marketing/social-media-service';

/**
 * Tarea programada: Sincronizar analíticas sociales cada 6 horas
 */
export const startMarketingCronJobs = () => {
  console.log('[Cron] Iniciando tareas programadas de Marketing');

  // Sincronizar analíticas cada 6 horas
  cron.schedule('0 */6 * * *', async () => {
    console.log('[Cron] Sincronizando analíticas sociales...');
    
    const recentPosts = await prisma.socialPost.findMany({
      where: {
        status: 'PUBLISHED',
        publishedAt: {
          gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // Últimos 30 días
        }
      },
      select: { id: true }
    });

    for (const post of recentPosts) {
      try {
        await SocialMediaService.syncAnalytics(post.id);
      } catch (error) {
        console.error(`[Cron] Error sincronizando analíticas para post ${post.id}:`, error);
      }
    }
  });

  // Limpiar assets temporales una vez al día
  cron.schedule('0 0 * * *', async () => {
    console.log('[Cron] Limpiando assets de marketing antiguos...');
    // Lógica de limpieza
  });
};
