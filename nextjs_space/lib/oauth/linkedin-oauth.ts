/**
 * LinkedIn OAuth Helper — Social API (Posts & Profile)
 *
 * LinkedIn API v2 OAuth 2.0 flow for social posting (not LinkedIn Ads).
 *
 * Scopes necesarios:
 *   w_member_social  → Publicar posts en nombre del usuario
 *   r_liteprofile    → Leer nombre y foto de perfil
 *   r_emailaddress   → Leer email del usuario
 *
 * Variables de entorno:
 *   LINKEDIN_CLIENT_ID
 *   LINKEDIN_CLIENT_SECRET
 */

const AUTH_URL = 'https://www.linkedin.com/oauth/v2/authorization';
const TOKEN_URL = 'https://www.linkedin.com/oauth/v2/accessToken';
const API_BASE = 'https://api.linkedin.com/v2';

export const LINKEDIN_SCOPES = ['w_member_social', 'r_liteprofile', 'r_emailaddress'].join(' ');

export interface LinkedInOAuthResult {
  success: boolean
  platform: 'linkedin'
  accessToken: string
  refreshToken?: string
  expiresAt?: Date
  profileId: string
  profileName: string
  profileImage?: string
  error?: string
}

/**
 * Genera la URL de autorización OAuth de LinkedIn.
 */
export function getLinkedInAuthUrl(redirectUri: string, state: string): string {
  const clientId = process.env.LINKEDIN_CLIENT_ID;
  if (!clientId) throw new Error('LINKEDIN_CLIENT_ID no configurado');

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    state,
    scope: LINKEDIN_SCOPES,
  });

  return `${AUTH_URL}?${params.toString()}`;
}

/**
 * Intercambia el code de autorización por un access token.
 */
async function exchangeCodeForToken(code: string, redirectUri: string): Promise<{
  accessToken: string
  refreshToken?: string
  expiresIn: number
}> {
  const clientId = process.env.LINKEDIN_CLIENT_ID;
  const clientSecret = process.env.LINKEDIN_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('LINKEDIN_CLIENT_ID y LINKEDIN_CLIENT_SECRET requeridos');
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
    throw new Error(data.error_description || data.error || 'Error intercambiando code por token de LinkedIn');
  }

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in || 5184000, // 60 días default
  };
}

/**
 * Obtiene el perfil básico del usuario de LinkedIn (id, name, picture).
 */
async function getProfile(accessToken: string): Promise<{
  id: string
  name: string
  picture?: string
}> {
  // Obtener datos básicos del perfil
  const profileRes = await fetch(`${API_BASE}/me?projection=(id,localizedFirstName,localizedLastName,profilePicture(displayImage~:playableStreams))`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'X-Restli-Protocol-Version': '2.0.0',
    },
  });

  if (!profileRes.ok) {
    throw new Error('No se pudo obtener el perfil de LinkedIn');
  }

  const profile = await profileRes.json();

  const id = profile.id;
  const name = `${profile.localizedFirstName || ''} ${profile.localizedLastName || ''}`.trim() || 'LinkedIn User';

  // Obtener foto de perfil
  let picture: string | undefined;
  try {
    const pictureData = profile.profilePicture?.['displayImage~']?.elements;
    if (Array.isArray(pictureData) && pictureData.length > 0) {
      const lastElement = pictureData[pictureData.length - 1];
      picture = lastElement?.identifiers?.[0]?.identifier;
    }
  } catch {
    // Foto no disponible
  }

  return { id, name, picture };
}

/**
 * Procesa el callback OAuth completo de LinkedIn.
 */
export async function processLinkedInCallback(
  code: string,
  redirectUri: string,
): Promise<LinkedInOAuthResult> {
  try {
    const { accessToken, refreshToken, expiresIn } = await exchangeCodeForToken(code, redirectUri);
    const profile = await getProfile(accessToken);

    return {
      success: true,
      platform: 'linkedin',
      accessToken,
      refreshToken,
      expiresAt: new Date(Date.now() + expiresIn * 1000),
      profileId: profile.id,
      profileName: profile.name,
      profileImage: profile.picture,
    };
  } catch (error: any) {
    return {
      success: false,
      platform: 'linkedin',
      accessToken: '',
      profileId: '',
      profileName: '',
      error: error.message,
    };
  }
}
