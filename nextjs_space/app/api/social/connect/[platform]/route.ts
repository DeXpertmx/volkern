import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getMetaAuthUrl } from '@/lib/nexus/meta-oauth';
import { getLinkedInAuthUrl } from '@/lib/oauth/linkedin-oauth';
import { getGoogleAuthUrl } from '@/lib/oauth/google-oauth';
import { getTikTokAuthUrl } from '@/lib/oauth/tiktok-oauth';
import { randomUUID } from 'crypto';
import { SOCIAL_PLATFORMS, disponibilidad, type SocialPlatformKey } from '@/lib/social/platform-env';

export const dynamic = 'force-dynamic';

/**
 * GET /api/social/connect/[platform]
 * Inicia el flujo OAuth redirigiendo al diálogo de autorización de la plataforma.
 * Soporta: facebook, instagram, linkedin, youtube, tiktok
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { platform: string } },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.redirect(new URL('/auth/login', process.env.NEXTAUTH_URL || 'https://volkern.app'));
  }

  const platform = params.platform as SocialPlatformKey;

  if (!SOCIAL_PLATFORMS.includes(platform)) {
    return NextResponse.json(
      { error: `Plataforma no soportada: ${params.platform}. Las plataformas válidas son: ${SOCIAL_PLATFORMS.join(', ')}` },
      { status: 400 },
    );
  }

  // Sin las credenciales OAuth de la app no hay diálogo de autorización al que ir.
  // Se devuelve qué falta para que la pantalla pueda explicarlo.
  const { configured, missing } = disponibilidad(platform);
  if (!configured) {
    const settingsUrl = `${process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/dashboard/social/settings`;
    const faltantes = encodeURIComponent(missing.join(','));
    return NextResponse.redirect(`${settingsUrl}?error=setup_required&platform=${platform}&missing=${faltantes}`);
  }

  const state = randomUUID();
  const appUrl = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const redirectUri = `${appUrl}/api/social/callback/${platform}`;

  let authUrl: string;

  switch (platform) {
    case 'facebook':
    case 'instagram':
      authUrl = getMetaAuthUrl(redirectUri, state, platform);
      break;
    case 'linkedin':
      authUrl = getLinkedInAuthUrl(redirectUri, state);
      break;
    case 'youtube':
      authUrl = getGoogleAuthUrl(redirectUri, state);
      break;
    case 'tiktok':
      authUrl = getTikTokAuthUrl(redirectUri, state);
      break;
    default:
      return NextResponse.json({ error: 'Plataforma no soportada' }, { status: 400 });
  }

  const response = NextResponse.redirect(authUrl);
  response.cookies.set(`social_oauth_state_${platform}`, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600,
    path: '/',
  });

  return response;
}
