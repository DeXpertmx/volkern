import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { encrypt } from '@/lib/core/crypto';
import { processMetaCallback } from '@/lib/nexus/meta-oauth';

export const dynamic = 'force-dynamic';

/**
 * GET /api/social/callback/[platform]
 * Callback OAuth de Meta. Recibe el code, valida el state CSRF,
 * intercambia tokens, obtiene perfil y guarda en SocialPlatformConfig.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { platform: string } }
) {
  const platform = params.platform as 'facebook' | 'instagram';
  const searchParams = request.nextUrl.searchParams;

  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const errorParam = searchParams.get('error');
  const errorReason = searchParams.get('error_reason');

  const appUrl = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const settingsUrl = `${appUrl}/dashboard/social/settings`;

  // El usuario canceló la autorización en Meta
  if (errorParam) {
    console.warn(`[Social OAuth] Usuario canceló la autorización de ${platform}: ${errorReason}`);
    return NextResponse.redirect(`${settingsUrl}?error=cancelled&platform=${platform}`);
  }

  if (!code || !state) {
    return NextResponse.redirect(`${settingsUrl}?error=invalid_callback&platform=${platform}`);
  }

  // Validar state CSRF
  const storedState = request.cookies.get(`social_oauth_state_${platform}`)?.value;
  if (!storedState || storedState !== state) {
    console.error('[Social OAuth] State CSRF inválido');
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

  // Procesar el callback OAuth completo (exchange code, get profile, etc.)
  const result = await processMetaCallback(code, redirectUri, platform);

  if (!result.success) {
    console.error(`[Social OAuth] Error en callback de ${platform}:`, result.error);
    const encodedError = encodeURIComponent(result.error || 'Error desconocido');
    return NextResponse.redirect(`${settingsUrl}?error=oauth_failed&platform=${platform}&message=${encodedError}`);
  }

  try {
    // Cifrar el token antes de guardar en BD
    const encryptedToken = encrypt(result.accessToken);

    await prisma.socialPlatformConfig.upsert({
      where: {
        tenantId_platform: { tenantId, platform },
      },
      update: {
        accessToken: encryptedToken,
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

    console.log(`[Social OAuth] ✅ ${platform} conectado para tenant ${tenantId} → Perfil: ${result.profileName}`);

    // Limpiar cookie de state
    const response = NextResponse.redirect(`${settingsUrl}?connected=${platform}`);
    response.cookies.delete(`social_oauth_state_${platform}`);

    return response;
  } catch (dbError: any) {
    console.error('[Social OAuth] Error guardando config en BD:', dbError);
    return NextResponse.redirect(`${settingsUrl}?error=db_error&platform=${platform}`);
  }
}
