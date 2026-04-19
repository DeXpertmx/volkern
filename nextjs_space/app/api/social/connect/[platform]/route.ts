import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getMetaAuthUrl } from '@/lib/nexus/meta-oauth';
import { randomUUID } from 'crypto';

export const dynamic = 'force-dynamic';

/**
 * GET /api/social/connect/[platform]
 * Inicia el flujo OAuth redirigiendo al diálogo de autorización de Meta.
 * Soporta plataformas: 'facebook', 'instagram'
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { platform: string } }
) {
  // Verificar que el usuario está autenticado
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.redirect(new URL('/auth/login', request.url));
  }

  const platform = params.platform as 'facebook' | 'instagram';

  if (!['facebook', 'instagram'].includes(platform)) {
    return NextResponse.json({ error: 'Plataforma no soportada' }, { status: 400 });
  }

  // Verificar que las variables de entorno están configuradas
  if (!process.env.FACEBOOK_APP_ID) {
    return NextResponse.redirect(new URL('/dashboard/social/settings?error=setup_required', request.url));
  }

  // Generar state CSRF único para este intento de conexión
  const state = randomUUID();

  // Construir la redirect URI que Meta llamará de vuelta
  const appUrl = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || `http://localhost:3000`;
  const redirectUri = `${appUrl}/api/social/callback/${platform}`;

  // Construir la URL OAuth de Meta
  const authUrl = getMetaAuthUrl(redirectUri, state, platform);

  // Guardar el state en una cookie HttpOnly para validarlo en el callback
  const response = NextResponse.redirect(authUrl);
  response.cookies.set(`social_oauth_state_${platform}`, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600, // 10 minutos para completar el OAuth
    path: '/',
  });

  return response;
}
