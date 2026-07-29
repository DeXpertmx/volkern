import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getMetaAuthUrl } from '@/lib/nexus/meta-oauth';
import { getLinkedInAuthUrl } from '@/lib/oauth/linkedin-oauth';
import { getGoogleAuthUrl } from '@/lib/oauth/google-oauth';
import { getTikTokAuthUrl } from '@/lib/oauth/tiktok-oauth';
import { randomUUID } from 'crypto';

export const dynamic = 'force-dynamic';

const SUPPORTED_PLATFORMS = ['facebook', 'instagram', 'linkedin', 'youtube', 'tiktok'] as const;

const PLATFORM_ENV_REQUIREMENTS: Record<string, string[]> = {
  facebook: ['FACEBOOK_APP_ID'],
  instagram: ['FACEBOOK_APP_ID'],
  linkedin: ['LINKEDIN_CLIENT_ID'],
  youtube: ['GOOGLE_CLIENT_ID'],
  tiktok: ['TIKTOK_CLIENT_ID'],
};

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
    return NextResponse.redirect(new URL('/auth/login', request.url));
  }

  const platform = params.platform;

  if (!SUPPORTED_PLATFORMS.includes(platform as any)) {
    return NextResponse.json(
      { error: `Plataforma no soportada: ${platform}. Las plataformas válidas son: ${SUPPORTED_PLATFORMS.join(', ')}` },
      { status: 400 },
    );
  }

  // Verificar que las variables de entorno necesarias están configuradas
  const requiredEnvVars = PLATFORM_ENV_REQUIREMENTS[platform] || [];
  for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
      const settingsUrl = `${process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/dashboard/social/settings`;
      return NextResponse.redirect(`${settingsUrl}?error=setup_required&platform=${platform}`);
    }
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
