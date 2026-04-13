/**
 * Meta OAuth Helper — Facebook & Instagram Business
 * Encapsula toda la lógica de autenticación con Meta Graph API v19.0
 */

const META_GRAPH_API = 'https://graph.facebook.com/v19.0';
const META_OAUTH_URL = 'https://www.facebook.com/v19.0/dialog/oauth';
const META_TOKEN_URL = 'https://graph.facebook.com/v19.0/oauth/access_token';

// Scopes requeridos para Facebook Pages + Instagram Business
export const META_SCOPES = [
  'pages_manage_posts',
  'pages_read_engagement',
  'pages_show_list',
  'instagram_basic',
  'instagram_content_publish',
  'instagram_manage_insights',
  'business_management',
].join(',');

// Scopes solo para Facebook (sin Instagram)
export const FACEBOOK_SCOPES = [
  'pages_manage_posts',
  'pages_read_engagement',
  'pages_show_list',
].join(',');

export interface MetaPage {
  id: string;
  name: string;
  picture?: { data: { url: string } };
  access_token: string;
  instagram_business_account?: { id: string };
}

export interface MetaOAuthResult {
  success: boolean;
  platform: 'facebook' | 'instagram';
  accessToken: string;
  profileId: string;
  profileName: string;
  profileImage?: string;
  expiresAt?: Date;
  error?: string;
}

/**
 * Genera la URL de autorización OAuth de Meta.
 */
export function getMetaAuthUrl(redirectUri: string, state: string, platform: 'facebook' | 'instagram' = 'facebook'): string {
  const scopes = platform === 'instagram' ? META_SCOPES : META_SCOPES; // Mismos scopes, ambos requieren permisos Meta

  const params = new URLSearchParams({
    client_id: process.env.FACEBOOK_APP_ID!,
    redirect_uri: redirectUri,
    scope: scopes,
    state,
    response_type: 'code',
  });

  return `${META_OAUTH_URL}?${params.toString()}`;
}

/**
 * Intercambia el code de autorización por un short-lived user token.
 */
export async function exchangeCodeForUserToken(
  code: string,
  redirectUri: string
): Promise<{ accessToken: string; tokenType: string }> {
  const params = new URLSearchParams({
    client_id: process.env.FACEBOOK_APP_ID!,
    client_secret: process.env.FACEBOOK_APP_SECRET!,
    redirect_uri: redirectUri,
    code,
  });

  const res = await fetch(`${META_TOKEN_URL}?${params.toString()}`);
  const data = await res.json();

  if (!res.ok || data.error) {
    throw new Error(data.error?.message || 'Error intercambiando código OAuth con Meta');
  }

  return {
    accessToken: data.access_token,
    tokenType: data.token_type,
  };
}

/**
 * Extiende un short-lived token (1h) a long-lived token (~60 días).
 */
export async function getLongLivedUserToken(shortToken: string): Promise<{
  accessToken: string;
  expiresAt: Date;
}> {
  const params = new URLSearchParams({
    grant_type: 'fb_exchange_token',
    client_id: process.env.FACEBOOK_APP_ID!,
    client_secret: process.env.FACEBOOK_APP_SECRET!,
    fb_exchange_token: shortToken,
  });

  const res = await fetch(`${META_TOKEN_URL}?${params.toString()}`);
  const data = await res.json();

  if (!res.ok || data.error) {
    throw new Error(data.error?.message || 'Error obteniendo long-lived token de Meta');
  }

  // expires_in está en segundos
  const expiresAt = new Date(Date.now() + (data.expires_in || 5184000) * 1000);

  return {
    accessToken: data.access_token,
    expiresAt,
  };
}

/**
 * Obtiene la lista de Pages administradas por el usuario.
 * Retorna el Page Access Token (no expira para páginas).
 */
export async function getUserPages(userToken: string): Promise<MetaPage[]> {
  const res = await fetch(
    `${META_GRAPH_API}/me/accounts?fields=id,name,picture,access_token,instagram_business_account&access_token=${userToken}`
  );
  const data = await res.json();

  if (!res.ok || data.error) {
    throw new Error(data.error?.message || 'Error obteniendo páginas de Facebook');
  }

  return data.data as MetaPage[];
}

/**
 * Obtiene info básica de la cuenta Instagram Business vinculada a una Page.
 */
export async function getInstagramAccount(
  igAccountId: string,
  pageToken: string
): Promise<{ id: string; name: string; profilePicture?: string; username?: string }> {
  const res = await fetch(
    `${META_GRAPH_API}/${igAccountId}?fields=id,name,profile_picture_url,username&access_token=${pageToken}`
  );
  const data = await res.json();

  if (!res.ok || data.error) {
    throw new Error(data.error?.message || 'Error obteniendo cuenta Instagram');
  }

  return {
    id: data.id,
    name: data.name || data.username,
    profilePicture: data.profile_picture_url,
    username: data.username,
  };
}

/**
 * Helper principal: Procesa el callback OAuth completo de Meta.
 * Retorna los datos listos para guardar en SocialPlatformConfig.
 * 
 * Para Facebook: usa el Page Access Token (no expira)
 * Para Instagram: usa el Page Token pero guarda el IG Account ID como profileId
 */
export async function processMetaCallback(
  code: string,
  redirectUri: string,
  platform: 'facebook' | 'instagram',
  pageIndex: number = 0
): Promise<MetaOAuthResult> {
  try {
    // 1. Code → Short-lived user token
    const { accessToken: shortToken } = await exchangeCodeForUserToken(code, redirectUri);

    // 2. Short-lived → Long-lived user token
    const { accessToken: longToken, expiresAt } = await getLongLivedUserToken(shortToken);

    // 3. Obtener páginas administradas
    const pages = await getUserPages(longToken);

    if (pages.length === 0) {
      return {
        success: false,
        platform,
        accessToken: '',
        profileId: '',
        profileName: '',
        error: 'No se encontraron Páginas de Facebook administradas por este usuario. Asegúrate de ser administrador de una Página.',
      };
    }

    // Usar la primera página disponible (en el futuro, se puede dejar elegir)
    const page = pages[pageIndex] || pages[0];

    if (platform === 'facebook') {
      // Para Facebook: el Page Access Token es permanente (no expira para páginas)
      return {
        success: true,
        platform: 'facebook',
        accessToken: page.access_token, // Page token, permanente
        profileId: page.id,
        profileName: page.name,
        profileImage: page.picture?.data?.url,
        // Los Page tokens no expiran si no se revocan
        expiresAt: undefined,
      };
    }

    // Para Instagram: necesitamos el IG Business Account vinculado a la Page
    if (!page.instagram_business_account?.id) {
      return {
        success: false,
        platform: 'instagram',
        accessToken: '',
        profileId: '',
        profileName: '',
        error: `La página "${page.name}" no tiene una cuenta de Instagram Business vinculada. Ve a Configuración de Facebook → Instagram → Conectar cuenta.`,
      };
    }

    const igAccount = await getInstagramAccount(page.instagram_business_account.id, page.access_token);

    return {
      success: true,
      platform: 'instagram',
      accessToken: page.access_token, // El Page token se usa para publicar en Instagram también
      profileId: igAccount.id, // IG Account ID (no el Page ID)
      profileName: igAccount.name || igAccount.username || page.name,
      profileImage: igAccount.profilePicture,
      expiresAt: undefined, // Page tokens son permanentes
    };
  } catch (error: any) {
    return {
      success: false,
      platform,
      accessToken: '',
      profileId: '',
      profileName: '',
      error: error.message,
    };
  }
}
