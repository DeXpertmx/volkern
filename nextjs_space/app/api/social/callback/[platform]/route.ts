import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { encrypt } from '@/lib/core/crypto';
import { processMetaCallback } from '@/lib/nexus/meta-oauth';
import { processLinkedInCallback } from '@/lib/oauth/linkedin-oauth';
import { processGoogleCallback } from '@/lib/oauth/google-oauth';
import { processTikTokCallback } from '@/lib/oauth/tiktok-oauth';

export const dynamic = 'force-dynamic';

const SUPPORTED_PLATFORMS = ['facebook', 'instagram', 'linkedin', 'youtube', 'tiktok'] as const;

/**
 * GET /api/social/callback/[platform]
 * Callback OAuth de cada plataforma. Recibe el code, valida el state CSRF,
 * intercambia tokens, obtiene perfil y guarda en SocialPlatformConfig.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { platform: string } },
) {
  const platform = params.platform as typeof SUPPORTED_PLATFORMS[number];
  const searchParams = request.nextUrl.searchParams;

  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const errorParam = searchParams.get('error');
  const errorReason = searchParams.get('error_reason');

  const appUrl = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const settingsUrl = `${appUrl}/dashboard/social/settings`;

  // Validar plataforma
  if (!SUPPORTED_PLATFORMS.includes(platform as any)) {
    return NextResponse.json({ error: 'Plataforma no soportada' }, { status: 400 });
  }

  // El usuario canceló la autorización
  if (errorParam) {
    return NextResponse.redirect(`${settingsUrl}?error=cancelled&platform=${platform}`);
  }

  if (!code || !state) {
    return NextResponse.redirect(`${settingsUrl}?error=invalid_callback&platform=${platform}`);
  }

  // Validar state CSRF
  const storedState = request.cookies.get(`social_oauth_state_${platform}`)?.value;
  if (!storedState || storedState !== state) {
    return NextResponse.redirect(`${settingsUrl}?error=csrf_mismatch&platform=${platform}`);
  }

  // Verificar sesión del usuario
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.redirect(`${appUrl}/auth/login`);
  }

  // Obtener el tenantId del usuario
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { tenantId: true },
  });

  if (!user?.tenantId) {
    return NextResponse.redirect(`${settingsUrl}?error=no_tenant&platform=${platform}`);
  }

  const tenantId = user.tenantId;
  const redirectUri = `${appUrl}/api/social/callback/${platform}`;

  // Procesar el callback OAuth según la plataforma
  let result: any;

  switch (platform) {
    case 'facebook':
    case 'instagram':
      result = await processMetaCallback(code, redirectUri, platform);
      break;
    case 'linkedin':
      result = await processLinkedInCallback(code, redirectUri);
      break;
    case 'youtube':
      result = await processGoogleCallback(code, redirectUri);
      break;
    case 'tiktok':
      result = await processTikTokCallback(code, redirectUri);
      break;
    default:
      return NextResponse.redirect(`${settingsUrl}?error=unsupported&platform=${platform}`);
  }

  if (!result.success) {
    const encodedError = encodeURIComponent(result.error || 'Error desconocido');
    return NextResponse.redirect(`${settingsUrl}?error=oauth_failed&platform=${platform}&message=${encodedError}`);
  }

  try {
    // Cifrar el token antes de guardar en BD
    const encryptedToken = encrypt(result.accessToken);
    const encryptedRefreshToken = result.refreshToken
      ? encrypt(result.refreshToken)
      : null;

    await prisma.socialPlatformConfig.upsert({
      where: {
        tenantId_platform: { tenantId, platform },
      },
      update: {
        accessToken: encryptedToken,
        refreshToken: encryptedRefreshToken,
        profileId: result.profileId,
        profileName: result.profileName,
        profileImage: result.profileImage,
        expiresAt: result.expiresAt || null,
        isActive: true,
        updatedAt: new Date(),
        metadata: {
          connectedAt: new Date().toISOString(),
          connectedBy: session.user.email || session.user.id,
        },
      },
      create: {
        tenantId,
        platform,
        accessToken: encryptedToken,
        refreshToken: encryptedRefreshToken,
        profileId: result.profileId,
        profileName: result.profileName,
        profileImage: result.profileImage,
        expiresAt: result.expiresAt || null,
        isActive: true,
        metadata: {
          connectedAt: new Date().toISOString(),
          connectedBy: session.user.email || session.user.id,
        },
      },
    });

    // Limpiar cookie de state
    const response = NextResponse.redirect(`${settingsUrl}?connected=${platform}`);
    response.cookies.delete(`social_oauth_state_${platform}`);

    return response;
  } catch (dbError: any) {
    return NextResponse.redirect(`${settingsUrl}?error=db_error&platform=${platform}`);
  }
}
