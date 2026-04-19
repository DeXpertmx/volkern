import { prisma } from '../db';
import { VaultService } from '../security/vault';
import { queueMarketingTask } from '../core/queue-service';

export type SocialPlatform = 'LINKEDIN' | 'YOUTUBE' | 'TIKTOK';

export class SocialMediaService {
  /**
   * Obtiene la configuración de una plataforma para un tenant
   */
  private static async getPlatformConfig(tenantId: string, platform: SocialPlatform) {
    const config = await prisma.socialPlatformConfig.findUnique({
      where: {
        tenantId_platform: { tenantId, platform }
      },
      include: { tenant: { select: { vaultSeed: true } } }
    });

    if (!config || !config.isActive) {
      throw new Error(`Configuración de ${platform} no activa o inexistente para el tenant ${tenantId}`);
    }

    const accessToken = VaultService.decrypt(config.accessToken, tenantId, config.tenant.vaultSeed);
    const refreshToken = config.refreshToken 
      ? VaultService.decrypt(config.refreshToken, tenantId, config.tenant.vaultSeed)
      : null;

    return { ...config, accessToken, refreshToken };
  }

  /**
   * Programa una publicación social
   */
  static async schedulePost(params: {
    tenantId: string;
    platform: SocialPlatform;
    content: string;
    mediaUrls?: string[];
    scheduledAt?: Date;
  }) {
    const { tenantId, platform, content, mediaUrls = [], scheduledAt } = params;

    // Crear el registro en DB
    const post = await prisma.socialPost.create({
      data: {
        tenantId,
        platform,
        content,
        mediaUrls,
        status: scheduledAt ? 'SCHEDULED' : 'DRAFT',
        scheduledAt,
      }
    });

    // Si tiene fecha programada, encolar en BullMQ
    if (scheduledAt) {
      const delay = scheduledAt.getTime() - Date.now();
      await queueMarketingTask('SOCIAL_POSTS', `post-${post.id}`, { postId: post.id }, { delay: Math.max(0, delay) });
    }

    return post;
  }

  /**
   * Publica contenido en LinkedIn
   */
  static async publishToLinkedIn(postId: string) {
    const post = await prisma.socialPost.findUnique({
      where: { id: postId },
      include: { tenant: { select: { vaultSeed: true } } }
    });

    if (!post) throw new Error('Post no encontrado');

    const config = await this.getPlatformConfig(post.tenantId, 'LINKEDIN');
    
    // Simulación de llamada API LinkedIn (UGC Post API)
    console.log(`[LinkedIn] Publicando post ${postId} con token ${config.accessToken.substring(0, 10)}...`);
    
    // Aquí iría el fetch real a https://api.linkedin.com/v2/ugcPosts
    
    await prisma.socialPost.update({
      where: { id: postId },
      data: { status: 'PUBLISHED', publishedAt: new Date() }
    });

    return { success: true };
  }

  /**
   * Extrae analíticas de un post
   */
  static async syncAnalytics(postId: string) {
    const post = await prisma.socialPost.findUnique({
      where: { id: postId }
    });

    if (!post || post.status !== 'PUBLISHED') return;

    const config = await this.getPlatformConfig(post.tenantId, post.platform as SocialPlatform);

    // Llamada a la API de la plataforma para obtener métricas
    // Simulación:
    const mockMetrics = {
      views: Math.floor(Math.random() * 1000),
      likes: Math.floor(Math.random() * 100),
      comments: Math.floor(Math.random() * 20),
      shares: Math.floor(Math.random() * 10),
      clicks: Math.floor(Math.random() * 50),
    };

    await prisma.socialAnalytics.upsert({
      where: { postId },
      create: {
        postId,
        ...mockMetrics,
        engagementRate: (mockMetrics.likes + mockMetrics.comments) / (mockMetrics.views || 1)
      },
      update: {
        ...mockMetrics,
        engagementRate: (mockMetrics.likes + mockMetrics.comments) / (mockMetrics.views || 1),
        lastUpdated: new Date()
      }
    });
  }
}
