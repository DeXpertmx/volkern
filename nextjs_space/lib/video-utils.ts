/**
 * Utilidades para manejo de URLs de video externas (YouTube, Vimeo, Dailymotion, HeyGen)
 */

export type VideoProvider = 'youtube' | 'vimeo' | 'dailymotion' | 'heygen' | 'upload' | 'unknown';

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

  // HeyGen (app.heygen.com/videos/<id> | /share/<id> | /embeds/<id>)
  const heygenRegex = /(?:app\.heygen\.com|share\.heygen\.com)\/(?:videos|share|embeds)\/([a-zA-Z0-9_-]+)/i;
  const heygenMatch = url.match(heygenRegex);
  if (heygenMatch && heygenMatch[1]) {
    return {
      provider: 'heygen',
      id: heygenMatch[1],
      embedUrl: `https://app.heygen.com/embeds/${heygenMatch[1]}`,
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

/**
 * Convierte cualquier URL de video compartida en su URL de iframe embebible.
 *
 * Soporta YouTube (watch / youtu.be / shorts / live / embed), Vimeo, Dailymotion y
 * HeyGen. Arregla protocolos ausentes ("www.youtube.com/..." → "https://...") y
 * conserva parámetros útiles de YouTube (list, start/t). Cualquier otra URL http(s)
 * se devuelve tal cual (asume que ya es embebible); devuelve null si no es una URL.
 *
 * Usada por el bloque «Video» del Web Creator (type volkern-video).
 */
export function normalizeVideoEmbedUrl(input: string | null | undefined): string | null {
  if (!input) return null;
  let url = String(input).trim();
  if (!url) return null;

  // Arreglar protocolo ausente o protocol-relative
  if (!/^https?:\/\//i.test(url)) {
    if (/^\/\//.test(url)) {
      url = 'https:' + url;
    } else if (/^[a-z0-9-]+(\.[a-z0-9-]+)+([/?#].*)?$/i.test(url)) {
      // parece un dominio: www.youtube.com/..., app.heygen.com/...
      url = 'https://' + url;
    } else {
      return null;
    }
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  const host = parsed.hostname.replace(/^www\./i, '').toLowerCase();
  const path = parsed.pathname.replace(/\/+$/, '');

  // ── YouTube ──
  if (/(^|\.)youtube\.com$/.test(host) || /(^|\.)youtube-nocookie\.com$/.test(host) || host === 'youtu.be') {
    let id = '';
    if (host === 'youtu.be') {
      id = path.split('/').filter(Boolean)[0] || '';
    } else {
      const m = path.match(/\/(?:embed|shorts|live|v)\/([\w-]+)/);
      if (m) {
        id = m[1];
      } else {
        id = parsed.searchParams.get('v') || '';
      }
    }
    if (!id) return url; // no se pudo extraer el id: usar tal cual
    const params = new URLSearchParams();
    const list = parsed.searchParams.get('list');
    const t = parsed.searchParams.get('t') || parsed.searchParams.get('start');
    if (list) params.set('list', list);
    if (t) {
      const start = parseTimeToSeconds(t);
      if (start > 0) params.set('start', String(start));
    }
    const qs = params.toString();
    return `https://www.youtube.com/embed/${id}${qs ? `?${qs}` : ''}`;
  }

  // ── Vimeo ──
  if (/(^|\.)vimeo\.com$/.test(host)) {
    if (host === 'player.vimeo.com') return url; // ya es embed
    const segments = path.split('/').filter(Boolean);
    const last = segments[segments.length - 1] || '';
    if (/^\d+$/.test(last)) return `https://player.vimeo.com/video/${last}`;
    return url;
  }

  // ── Dailymotion ──
  if (/(^|\.)dailymotion\.com$/.test(host) || host === 'dai.ly') {
    if (path.includes('/embed/')) return url;
    const segments = path.split('/').filter(Boolean);
    const last = segments[segments.length - 1] || '';
    if (last) return `https://www.dailymotion.com/embed/video/${last}`;
    return url;
  }

  // ── HeyGen ──
  if (/(^|\.)heygen\.com$/.test(host) || /(^|\.)heygen\.ai$/.test(host)) {
    const m = path.match(/\/(?:videos|share|embeds)\/([\w-]+)/);
    if (m) return `https://app.heygen.com/embeds/${m[1]}`;
    return url;
  }

  // Cualquier otra URL: usar tal cual
  return url;
}

/**
 * Convierte una marca de tiempo de YouTube ("90", "1m30s", "2h5m") a segundos.
 */
function parseTimeToSeconds(t: string): number {
  const m = t.trim().match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/i);
  if (m && (m[1] || m[2] || m[3])) {
    return (parseInt(m[1] || '0', 10) || 0) * 3600 +
      (parseInt(m[2] || '0', 10) || 0) * 60 +
      (parseInt(m[3] || '0', 10) || 0);
  }
  const n = parseInt(t, 10);
  return isNaN(n) ? 0 : n;
}
