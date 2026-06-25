import { prisma } from '@/lib/db';
import { decrypt } from '@/lib/core/crypto';

export interface SocialPublishResult {
  success: boolean;
  platformMessageId?: string;
  error?: string;
}

class SocialPostingService {
  /**
   * Publica un post en las plataformas seleccionadas
   */
  async publishPost(postId: string): Promise<Record<string, SocialPublishResult>> {
    const post = await prisma.socialPost.findUnique({
      where: { id: postId },
      include: { tenant: true }
    });

    if (!post) throw new Error('Post no encontrado');

    const results: Record<string, SocialPublishResult> = {};

    for (const platform of post.platforms) {
      try {
        console.log(`[🚀 SocialPosting] Publicando en ${platform} para tenant ${post.tenantId}`);
        
        const config = await prisma.socialPlatformConfig.findUnique({
          where: { 
            tenantId_platform: { 
              tenantId: post.tenantId, 
              platform 
            } 
          }
        });

        if (!config || !config.accessToken) {
          results[platform] = { success: false, error: 'Configuración o token no encontrado' };
          continue;
        }

        const decryptedToken = decrypt(config.accessToken);

        if (platform === 'facebook') {
          results[platform] = await this.publishToFacebook(post.content, post.mediaUrls, decryptedToken, config.profileId!);
        } else if (platform === 'instagram') {
          results[platform] = await this.publishToInstagram(post.content, post.mediaUrls, decryptedToken, config.profileId!);
        } else {
          results[platform] = { success: false, error: 'Plataforma no soportada aún' };
        }
      } catch (error: any) {
        results[platform] = { success: false, error: error.message };
      }
    }

    // Actualizar estado del post basalto en resultados
    const allSuccess = Object.values(results).every(r => r.success);
    const someSuccess = Object.values(results).some(r => r.success);

    await prisma.socialPost.update({
      where: { id: postId },
      data: {
        status: allSuccess ? 'published' : (someSuccess ? 'partial' : 'failed'),
        publishedAt: someSuccess ? new Date() : undefined,
        errorLog: allSuccess ? null : JSON.stringify(results),
        metadata: { results } as any
      }
    });

    return results;
  }

  /**
   * Facebook Page Publishing
   */
  private async publishToFacebook(content: string, mediaUrls: string[], token: string, pageId: string): Promise<SocialPublishResult> {
    try {
      // Si hay imágenes, la lógica es diferente (crear fotos vs crear post)
      const endpoint = mediaUrls.length > 0 
        ? `https://graph.facebook.com/v19.0/${pageId}/photos`
        : `https://graph.facebook.com/v19.0/${pageId}/feed`;

      const body: any = {
        message: content,
        access_token: token,
      };

      if (mediaUrls.length > 0) {
        body.url = mediaUrls[0]; // Simplificado por ahora a 1 imagen
      }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await response.json();

      if (!response.ok) {
        return { success: false, error: data.error?.message || 'Error en Facebook API' };
      }

      return { success: true, platformMessageId: data.id || data.post_id };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }

  /**
   * Instagram Business Publishing
   */
  private async publishToInstagram(content: string, mediaUrls: string[], token: string, igAccountId: string): Promise<SocialPublishResult> {
    try {
      if (mediaUrls.length === 0) {
        return { success: false, error: 'Instagram requiere al menos una imagen' };
      }

      // 1. Crear Media Container
      const containerRes = await fetch(`https://graph.facebook.com/v19.0/${igAccountId}/media`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image_url: mediaUrls[0],
          caption: content,
          access_token: token,
        }),
      });

      const containerData = await containerRes.json();
      if (!containerRes.ok) return { success: false, error: containerData.error?.message };

      const creationId = containerData.id;

      // 2. Publicar Container
      const publishRes = await fetch(`https://graph.facebook.com/v19.0/${igAccountId}/media_publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          creation_id: creationId,
          access_token: token,
        }),
      });

      const publishData = await publishRes.json();
      if (!publishRes.ok) return { success: false, error: publishData.error?.message };

      return { success: true, platformMessageId: publishData.id };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }
}

export const socialPostingService = new SocialPostingService();
