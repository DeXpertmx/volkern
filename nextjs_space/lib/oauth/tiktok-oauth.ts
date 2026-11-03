/**
 * TikTok OAuth Helper — Content Posting API
 *
 * TikTok OAuth 2.0 flow para publicar contenido (fotos/videos) en TikTok.
 * NO es la API de TikTok Ads — esta es la Content Posting API para cuentas business.
 *
 * Scopes necesarios:
 *   user.info.basic      → Leer información del perfil (display_name, avatar)
 *   video.publish        → Publicación directa (video y foto, PULL_FROM_URL)
 *
 * No se pide `video.upload` (subir a la bandeja, que no usamos: publicamos
 * directamente) ni `user.info.profile`: TikTok exige en la revisión que solo se
 * soliciten los permisos que la app demuestra, y los que sobran retrasan la
 * aprobación.
 *
 * Variables de entorno:
 *   TIKTOK_CLIENT_ID
 *   TIKTOK_CLIENT_SECRET
 */

const AUTH_URL = 'https://www.tiktok.com/v2/auth/authorize';
const TOKEN_URL = 'https://open.tiktokapis.com/v2/oauth/token/';
const API_BASE = 'https://open.tiktokapis.com/v2';

export const TIKTOK_SCOPES = [
  'user.info.basic',
  'video.publish',
].join(',');

export interface TikTokOAuthResult {
  success: boolean
  platform: 'tiktok'
  accessToken: string
  refreshToken?: string
  expiresAt?: Date
  profileId: string       // open_id del usuario
  profileName: string      // display_name
  profileImage?: string    // avatar_url
  error?: string
}

/**
 * Genera la URL de autorización OAuth de TikTok.
 * TikTok requiere csrf_state en lugar de state.
 */
export function getTikTokAuthUrl(redirectUri: string, state: string): string {
  const clientKey = process.env.TIKTOK_CLIENT_ID;
  if (!clientKey) throw new Error('TIKTOK_CLIENT_ID no configurado');

  const params = new URLSearchParams({
    client_key: clientKey,
    response_type: 'code',
    redirect_uri: redirectUri,
    scope: TIKTOK_SCOPES,
    state,
  });

  return `${AUTH_URL}?${params.toString()}`;
}

/**
 * Intercambia el code de autorización por un access token.
 * TikTok usa client_key y client_secret en lugar de client_id y client_secret.
 */
async function exchangeCodeForToken(code: string, redirectUri: string): Promise<{
  accessToken: string
  refreshToken?: string
  expiresIn: number
  openId: string
}> {
  const clientKey = process.env.TIKTOK_CLIENT_ID;
  const clientSecret = process.env.TIKTOK_CLIENT_SECRET;

  if (!clientKey || !clientSecret) {
    throw new Error('TIKTOK_CLIENT_ID y TIKTOK_CLIENT_SECRET requeridos');
  }

  const params = new URLSearchParams({
    client_key: clientKey,
    client_secret: clientSecret,
    code,
    grant_type: 'authorization_code',
    redirect_uri: redirectUri,
  });

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  const data = await res.json();

  if (!res.ok || data.error) {
    throw new Error(data.error_description || data.error?.message || 'Error intercambiando code por token de TikTok');
  }

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in || 86400, // 24 horas default
    openId: data.open_id,
  };
}

/**
 * Obtiene la información básica del usuario de TikTok.
 * GET /v2/user/info/  con los fields solicitados.
 */
async function getUserInfo(accessToken: string): Promise<{
  openId: string
  displayName: string
  avatarUrl?: string
}> {
  const res = await fetch(
    `${API_BASE}/user/info/?fields=open_id,display_name,avatar_url`,
    {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    },
  );

  const data = await res.json();

  if (!res.ok || data.error) {
    throw new Error(data.error?.message || 'No se pudo obtener info del usuario de TikTok');
  }

  const user = data.data?.user;
  if (!user) {
    throw new Error('No se encontró información del usuario de TikTok');
  }

  return {
    openId: user.open_id || '',
    displayName: user.display_name || 'Usuario de TikTok',
    avatarUrl: user.avatar_url,
  };
}

/**
 * Procesa el callback OAuth completo de TikTok.
 */
export async function processTikTokCallback(
  code: string,
  redirectUri: string,
): Promise<TikTokOAuthResult> {
  try {
    const { accessToken, refreshToken, expiresIn } = await exchangeCodeForToken(code, redirectUri);
    const userInfo = await getUserInfo(accessToken);

    return {
      success: true,
      platform: 'tiktok',
      accessToken,
      refreshToken,
      expiresAt: new Date(Date.now() + expiresIn * 1000),
      profileId: userInfo.openId,
      profileName: userInfo.displayName,
      profileImage: userInfo.avatarUrl,
    };
  } catch (error: any) {
    return {
      success: false,
      platform: 'tiktok',
      accessToken: '',
      profileId: '',
      profileName: '',
      error: error.message,
    };
  }
}
