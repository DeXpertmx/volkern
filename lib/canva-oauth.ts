
/**
 * Funciones auxiliares para OAuth 2.0 con PKCE (Canva Integration)
 */

/**
 * Genera un string aleatorio seguro para usar como code_verifier
 */
export function generateCodeVerifier(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return base64UrlEncode(array);
}

/**
 * Genera el code_challenge a partir del code_verifier usando SHA-256
 */
export async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return base64UrlEncode(new Uint8Array(hash));
}

/**
 * Codifica un array de bytes en Base64 URL-safe
 */
function base64UrlEncode(array: Uint8Array): string {
  const base64 = btoa(String.fromCharCode(...array));
  return base64
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/**
 * Genera la URL de autorización de Canva
 */
export function generateAuthorizationUrl(
  clientId: string,
  redirectUri: string,
  codeChallenge: string,
  state?: string
): string {
  // Scopes necesarios para crear y gestionar diseños en Canva
  // Documentación: https://www.canva.dev/docs/connect/api-reference/authentication/
  const scopes = [
    'design:content:read',   // Leer contenido de diseños
    'design:content:write',  // Crear y modificar diseños
    'design:meta:read',      // Leer metadatos de diseños
    'asset:read',            // Leer assets (imágenes, etc.)
  ].join(' ');

  const params = new URLSearchParams({
    code_challenge_method: 's256',
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    code_challenge: codeChallenge,
    scope: scopes,  // ← AGREGADO: Solicitar permisos necesarios
  });

  if (state) {
    params.append('state', state);
  }

  return `https://www.canva.com/api/oauth/authorize?${params.toString()}`;
}

/**
 * Intercambia el código de autorización por un access token
 */
export async function exchangeCodeForToken(
  code: string,
  codeVerifier: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string
): Promise<{
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
}> {
  const response = await fetch('https://api.canva.com/rest/v1/oauth/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      code_verifier: codeVerifier,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Error al intercambiar código: ${response.status} - ${errorText}`);
  }

  return response.json();
}

/**
 * Refresca el access token usando el refresh token
 */
export async function refreshAccessToken(
  refreshToken: string,
  clientId: string,
  clientSecret: string
): Promise<{
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
}> {
  const response = await fetch('https://api.canva.com/rest/v1/oauth/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Error al refrescar token: ${response.status} - ${errorText}`);
  }

  return response.json();
}

