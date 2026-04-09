/**
 * Utilidades para manejo de URLs de video externas (YouTube, Vimeo, Dailymotion)
 */

export type VideoProvider = 'youtube' | 'vimeo' | 'dailymotion' | 'upload' | 'unknown';

export interface VideoInfo {
  provider: VideoProvider;
  id: string | null;
  embedUrl: string | null;
}

export function parseVideoUrl(url: string): VideoInfo {
  if (!url) return { provider: 'unknown', id: null, embedUrl: null };

  // YouTube
  const ytRegex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i;
  const ytMatch = url.match(ytRegex);
  if (ytMatch && ytMatch[1]) {
    return {
      provider: 'youtube',
      id: ytMatch[1],
      embedUrl: `https://www.youtube.com/embed/${ytMatch[1]}`,
    };
  }

  // Vimeo
  const vimeoRegex = /(?:vimeo\.com\/|player\.vimeo\.com\/video\/)([0-9]+)/i;
  const vimeoMatch = url.match(vimeoRegex);
  if (vimeoMatch && vimeoMatch[1]) {
    return {
      provider: 'vimeo',
      id: vimeoMatch[1],
      embedUrl: `https://player.vimeo.com/video/${vimeoMatch[1]}`,
    };
  }

  // Dailymotion
  const dmRegex = /(?:dailymotion\.com\/(?:video|embed\/video)\/|dai\.ly\/)([a-zA-Z0-9]+)/i;
  const dmMatch = url.match(dmRegex);
  if (dmMatch && dmMatch[1]) {
    return {
      provider: 'dailymotion',
      id: dmMatch[1],
      embedUrl: `https://www.dailymotion.com/embed/video/${dmMatch[1]}`,
    };
  }

  // Direct link or other
  if (url.startsWith('http') || url.startsWith('/')) {
    return {
      provider: 'upload',
      id: url,
      embedUrl: url,
    };
  }

  return { provider: 'unknown', id: null, embedUrl: null };
}

export function isValidVideoUrl(url: string): boolean {
  const info = parseVideoUrl(url);
  return info.provider !== 'unknown' && info.id !== null;
}
