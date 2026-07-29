/**
 * Google/YouTube OAuth Helper — YouTube Data API v3
 *
 * Usa Google OAuth 2.0 para obtener acceso a la API de YouTube.
 *
 * Scopes necesarios:
 *   https://www.googleapis.com/auth/youtube.upload      → Subir videos
 *   https://www.googleapis.com/auth/youtube.readonly    → Leer estadísticas del canal
 *   https://www.googleapis.com/auth/youtube.force-ssl   → Operaciones de escritura en el canal
 *
 * Variables de entorno:
 *   GOOGLE_CLIENT_ID
 *   GOOGLE_CLIENT_SECRET
 */

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3';

export const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube.readonly',
  'https://www.googleapis.com/auth/youtube.force-ssl',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/userinfo.email',
].join(' ');

export interface GoogleOAuthResult {
  success: boolean
  platform: 'youtube'
  accessToken: string
  refreshToken?: string
  expiresAt?: Date
  profileId: string      // YouTube channel ID
  profileName: string     // Channel title
  profileImage?: string   // Channel thumbnail
  error?: string
}

/**
 * Genera la URL de autorización OAuth de Google.
 */
export function getGoogleAuthUrl(redirectUri: string, state: string): string {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) throw new Error('GOOGLE_CLIENT_ID no configurado');

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    state,
    scope: GOOGLE_SCOPES,
    access_type: 'offline',          // Para recibir refresh_token
    prompt: 'consent',               // Forzar pantalla de consentimiento siempre
    include_granted_scopes: 'true',
  });

  return `${AUTH_URL}?${params.toString()}`;
}

/**
 * Intercambia el code de autorización por tokens.
 */
async function exchangeCodeForToken(code: string, redirectUri: string): Promise<{
  accessToken: string
  refreshToken?: string
  expiresIn: number
}> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET requeridos');
  }

  const params = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    client_id: clientId,
    client_secret: clientSecret,
  });

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  const data = await res.json();

  if (!res.ok || data.error) {
    throw new Error(data.error_description || data.error || 'Error intercambiando code por token de Google');
  }

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in || 3600,
  };
}

/**
 * Refresca un access token expirado usando el refresh token.
 * Útil para tokens de larga duración.
 */
export async function refreshGoogleToken(refreshToken: string): Promise<{
  accessToken: string
  expiresIn: number
}> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET requeridos');
  }

  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
  });

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  const data = await res.json();

  if (!res.ok || data.error) {
    throw new Error(data.error_description || 'Error refrescando token de Google');
  }

  return {
    accessToken: data.access_token,
    expiresIn: data.expires_in || 3600,
  };
}

/**
 * Obtiene la información del canal de YouTube autenticado.
 * Usa `mine=true` para obtener el canal del usuario autenticado.
 */
async function getYouTubeChannel(accessToken: string): Promise<{
  channelId: string
  title: string
  thumbnail?: string
}> {
  const res = await fetch(
    `${YOUTUBE_API_BASE}/channels?part=snippet,contentDetails&mine=true`,
    {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    },
  );

  const data = await res.json();

  if (!res.ok || data.error) {
    throw new Error(data.error?.message || 'No se pudo obtener el canal de YouTube');
  }

  const channel = data.items?.[0];
  if (!channel) {
    throw new Error('No se encontró un canal de YouTube para esta cuenta. Crea un canal primero.');
  }

  return {
    channelId: channel.id,
    title: channel.snippet?.title || 'Mi Canal de YouTube',
    thumbnail: channel.snippet?.thumbnails?.default?.url || channel.snippet?.thumbnails?.high?.url,
  };
}

/**
 * Procesa el callback OAuth completo de Google/YouTube.
 */
export async function processGoogleCallback(
  code: string,
  redirectUri: string,
): Promise<GoogleOAuthResult> {
  try {
    const { accessToken, refreshToken, expiresIn } = await exchangeCodeForToken(code, redirectUri);
    const channel = await getYouTubeChannel(accessToken);

    return {
      success: true,
      platform: 'youtube',
      accessToken,
      refreshToken,
      expiresAt: new Date(Date.now() + expiresIn * 1000),
      profileId: channel.channelId,
      profileName: channel.title,
      profileImage: channel.thumbnail,
    };
  } catch (error: any) {
    return {
      success: false,
      platform: 'youtube',
      accessToken: '',
      profileId: '',
      profileName: '',
      error: error.message,
    };
  }
}
