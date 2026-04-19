import { prisma } from '../db';
import { VaultService } from '../security/vault';
import { queueMarketingTask } from '../core/queue-service';

export type SocialPlatform = 'LINKEDIN' | 'YOUTUBE' | 'TIKTOK' | 'FACEBOOK' | 'INSTAGRAM';

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

    const post = await prisma.socialPost.create({
      data: {
        tenantId,
        platforms: [platform], // Ajustado al esquema que usa String[]
        content,
        mediaUrls,
        status: scheduledAt ? 'SCHEDULED' : 'DRAFT',
        scheduledFor: scheduledAt,
      }
    });

    if (scheduledAt) {
      const delay = scheduledAt.getTime() - Date.now();
      await queueMarketingTask('SOCIAL_POSTS', `post-${post.id}`, { postId: post.id }, { delay: Math.max(0, delay) });
    }

    return post;
  }

  /**
   * Enrutador de publicación basado en plataforma
   */
  static async publishToPlatform(postId: string, platform: SocialPlatform) {
    switch (platform) {
      case 'LINKEDIN': return this.publishToLinkedIn(postId);
      case 'YOUTUBE': return this.publishToYouTube(postId);
      case 'TIKTOK': return this.publishToTikTok(postId);
      case 'FACEBOOK': return this.publishToFacebook(postId);
      case 'INSTAGRAM': return this.publishToInstagram(postId);
      default: throw new Error(`Plataforma ${platform} no soportada`);
    }
  }

  static async publishToLinkedIn(postId: string) {
    console.log(`[LinkedIn] Publicando post ${postId}...`);
    // API Call Logic
    return this.updatePostStatus(postId, 'PUBLISHED');
  }

  static async publishToYouTube(postId: string) {
    console.log(`[YouTube] Subiendo video ${postId}...`);
    // API Call Logic
    return this.updatePostStatus(postId, 'PUBLISHED');
  }

  static async publishToTikTok(postId: string) {
    console.log(`[TikTok] Publicando video ${postId}...`);
    // API Call Logic
    return this.updatePostStatus(postId, 'PUBLISHED');
  }

  static async publishToFacebook(postId: string) {
    console.log(`[Facebook] Publicando en página ${postId}...`);
    // API Call Logic
    return this.updatePostStatus(postId, 'PUBLISHED');
  }

  static async publishToInstagram(postId: string) {
    console.log(`[Instagram] Publicando en Business Account ${postId}...`);
    // API Call Logic
    return this.updatePostStatus(postId, 'PUBLISHED');
  }

  private static async updatePostStatus(postId: string, status: string) {
    await prisma.socialPost.update({
      where: { id: postId },
      data: { status, publishedAt: new Date() }
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

    // Métricas reales vendrían de las APIs de redes sociales
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
