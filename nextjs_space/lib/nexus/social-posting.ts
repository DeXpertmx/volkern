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
        } else if (platform === 'linkedin') {
          results[platform] = await this.publishToLinkedIn(post.content, post.mediaUrls, decryptedToken, config.profileId!);
        } else if (platform === 'youtube') {
          results[platform] = await this.publishToYouTube(post.content, post.mediaUrls, decryptedToken, config.profileId!);
        } else if (platform === 'tiktok') {
          results[platform] = await this.publishToTikTok(post.content, post.mediaUrls, decryptedToken, config.profileId!);
        } else {
          results[platform] = { success: false, error: 'Plataforma no soportada' };
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
      const endpoint = mediaUrls.length > 0 
        ? `https://graph.facebook.com/v19.0/${pageId}/photos`
        : `https://graph.facebook.com/v19.0/${pageId}/feed`;

      const body: any = {
        message: content,
        access_token: token,
      };

      if (mediaUrls.length > 0) {
        body.url = mediaUrls[0];
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

  /**
   * LinkedIn Page Publishing
   */
  private async publishToLinkedIn(content: string, mediaUrls: string[], token: string, profileId: string): Promise<SocialPublishResult> {
    try {
      const endpoint = 'https://api.linkedin.com/v2/ugcPosts';

      const author = `urn:li:person:${profileId}`;
      const body: any = {
        author,
        lifecycleState: 'PUBLISHED',
        specificContent: {
          'com.linkedin.ugc.ShareContent': {
            shareCommentary: {
              text: content,
            },
            shareMediaCategory: mediaUrls.length > 0 ? 'IMAGE' : 'NONE',
          },
        },
        visibility: {
          'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC',
        },
      };

      if (mediaUrls.length > 0) {
        body.specificContent['com.linkedin.ugc.ShareContent'].media = mediaUrls.slice(0, 1).map((url) => ({
          status: 'READY',
          description: { text: content.slice(0, 200) },
          media: url,
          title: { text: content.slice(0, 100) },
        }));
      }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-Restli-Protocol-Version': '2.0.0',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (response.ok || response.status === 201) {
        const locationHeader = response.headers.get('x-restli-id') || response.headers.get('location') || '';
        const postId = locationHeader.split(':').pop() || `linkedin-${Date.now()}`;
        return { success: true, platformMessageId: postId };
      }

      const errorData = await response.json().catch(() => ({}));
      return { success: false, error: errorData.message || `LinkedIn API error (${response.status})` };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }

  /**
   * YouTube Video Upload — Resumable Upload Protocol
   *   1. POST /upload/youtube/v3/videos?part=snippet,status (metadata JSON)
   *      → Obtiene uploadUrl de Location header
   *   2. PUT uploadUrl (video binary)
   *      → Obtiene video ID
   *
   * Requiere scope: https://www.googleapis.com/auth/youtube.upload
   */
  private async publishToYouTube(content: string, mediaUrls: string[], token: string, channelId: string): Promise<SocialPublishResult> {
    try {
      if (mediaUrls.length === 0) {
        return { success: false, error: 'YouTube requiere al menos un archivo de video/imagen. Sube un video o Short desde la URL multimedia.' };
      }

      const mediaUrl = mediaUrls[0];

      // 1. Descargar el archivo multimedia del servidor
      const mediaResponse = await fetch(mediaUrl);
      if (!mediaResponse.ok) {
        return { success: false, error: `No se pudo descargar el archivo multimedia: ${mediaUrl} (HTTP ${mediaResponse.status})` };
      }

      const mediaBuffer = await mediaResponse.arrayBuffer();
      const mediaType = mediaResponse.headers.get('content-type') || 'video/mp4';
      const fileSize = mediaBuffer.byteLength;

      // 2. Inicializar la subida resumible con metadatos
      const metadata = {
        snippet: {
          title: content.slice(0, 100),
          description: content.slice(0, 5000),
          channelId,
        },
        status: {
          privacyStatus: 'public',
          selfDeclaredMadeForKids: false,
        },
      };

      const initResponse = await fetch(
        'https://www.googleapis.com/upload/youtube/v3/videos?part=snippet,status&uploadType=resumable',
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            'X-Upload-Content-Type': mediaType,
            'X-Upload-Content-Length': String(fileSize),
          },
          body: JSON.stringify(metadata),
        },
      );

      if (!initResponse.ok) {
        const errData = await initResponse.json().catch(() => ({}));
        return { success: false, error: errData.error?.message || `YouTube upload init failed (${initResponse.status})` };
      }

      const uploadUrl = initResponse.headers.get('Location');
      if (!uploadUrl) {
        return { success: false, error: 'YouTube no devolvió URL de subida' };
      }

      // 3. Subir el archivo binario al URL obtenido
      const uploadResponse = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': mediaType,
          'Content-Length': String(fileSize),
        },
        body: Buffer.from(mediaBuffer),
      });

      if (!uploadResponse.ok) {
        const errBody = await uploadResponse.text().catch(() => '');
        return { success: false, error: `YouTube upload failed (${uploadResponse.status}): ${errBody.slice(0, 200)}` };
      }

      const uploadData = await uploadResponse.json();
      const videoId = uploadData.id;

      if (!videoId) {
        return { success: false, error: 'YouTube no devolvió un video ID' };
      }

      return { success: true, platformMessageId: videoId };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }

  /**
   * TikTok Content Posting — Publica contenido usando PULL_FROM_URL
   *
   * TikTok Content Posting API v2 soporta PULL_FROM_URL, donde TikTok descarga
   * el archivo directamente desde la URL pública proporcionada.
   *
   * Flujo:
   *   Video: POST /v2/video/publish/  con source_info.source='PULL_FROM_URL'
   *   Foto:  POST /v2/photo/publish/  con source_info.source='PULL_FROM_URL'
   *
   * Scopes requeridos: user.info.basic, video.upload, video.publish
   */
  private async publishToTikTok(content: string, mediaUrls: string[], token: string, openId: string): Promise<SocialPublishResult> {
    try {
      if (mediaUrls.length === 0) {
        return { success: false, error: 'TikTok requiere al menos una imagen o video. Sube multimedia desde la URL.' };
      }

      const baseUrl = 'https://open.tiktokapis.com/v2';
      const headers: Record<string, string> = {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      };

      const firstUrl = mediaUrls[0];

      // Detectar si es video o imagen por extensión/content-type
      const ext = firstUrl.split('.').pop()?.toLowerCase() || '';
      const isVideo = ['mp4', 'mov', 'avi', 'webm', 'mkv'].includes(ext);

      if (isVideo) {
        // ── Video: PULL_FROM_URL ──
        const publishRes = await fetch(`${baseUrl}/video/publish/`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            post_info: {
              title: content.slice(0, 2200),
              privacy_level: 'PUBLIC',
              disable_duet: false,
              disable_stitch: false,
              disable_comment: false,
              brand_content_toggle: false,
              brand_organic_toggle: false,
            },
            source_info: {
              source: 'PULL_FROM_URL',
              video_url: firstUrl,
            },
          }),
        });

        const publishData = await publishRes.json();

        if (!publishRes.ok || publishData.error) {
          return { success: false, error: publishData.error?.message || `TikTok video publish error (${publishRes.status})` };
        }

        return {
          success: true,
          platformMessageId: publishData.data?.id || publishData.data?.share_id || `tiktok-${Date.now()}`,
        };
      }

      // ── Foto: PULL_FROM_URL ──
      const publishRes = await fetch(`${baseUrl}/photo/publish/`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          post_mode: 'DIRECT_POST',
          photo_info: {
            title: content.slice(0, 2200),
            privacy_level: 'PUBLIC',
          },
          source_info: {
            source: 'PULL_FROM_URL',
            photo_url: firstUrl,
          },
        }),
      });

      const publishData = await publishRes.json();

      if (!publishRes.ok || publishData.error) {
        return { success: false, error: publishData.error?.message || `TikTok photo publish error (${publishRes.status})` };
      }

      return {
        success: true,
        platformMessageId: publishData.data?.id || publishData.data?.share_id || `tiktok-${Date.now()}`,
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }
}

export const socialPostingService = new SocialPostingService();
