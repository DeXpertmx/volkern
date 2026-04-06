export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { exchangeCodeForToken } from '@/lib/canva-oauth';
import { prisma } from '@/lib/db';

/**
 * Maneja el callback de OAuth desde Canva
 * GET /api/canva/callback
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.email) {
      return NextResponse.redirect(
        `${process.env.NEXTAUTH_URL || 'https://volkern.com'}/auth/login?error=unauthorized`
      );
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    });

    if (!user) {
      return NextResponse.redirect(
        `${process.env.NEXTAUTH_URL || 'https://volkern.com'}/auth/login?error=user_not_found`
      );
    }

    // Obtener parámetros de la URL
    const searchParams = req.nextUrl.searchParams;
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');

    if (error) {
      console.error('Error de Canva OAuth:', error);
      return NextResponse.redirect(
        `${process.env.NEXTAUTH_URL || 'https://volkern.com'}/dashboard/campanas?canva_error=${error}`
      );
    }

    if (!code || !state) {
      return NextResponse.redirect(
        `${process.env.NEXTAUTH_URL || 'https://volkern.com'}/dashboard/campanas?error=missing_params`
      );
    }

    // Recuperar el code_verifier y state guardados
    const metadata = user.metadata as any;
    const canvaOAuth = metadata?.canvaOAuth;

    if (!canvaOAuth || !canvaOAuth.codeVerifier || !canvaOAuth.state) {
      return NextResponse.redirect(
        `${process.env.NEXTAUTH_URL || 'https://volkern.com'}/dashboard/campanas?error=invalid_session`
      );
    }

    // Verificar que el state coincida (prevención de CSRF)
    if (canvaOAuth.state !== state) {
      return NextResponse.redirect(
        `${process.env.NEXTAUTH_URL || 'https://volkern.com'}/dashboard/campanas?error=invalid_state`
      );
    }

    const clientId = process.env.NEXT_PUBLIC_CANVA_CLIENT_ID;
    const clientSecret = process.env.CANVA_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      return NextResponse.redirect(
        `${process.env.NEXTAUTH_URL || 'https://volkern.com'}/dashboard/campanas?error=missing_credentials`
      );
    }

    const redirectUri = `${process.env.NEXTAUTH_URL || 'https://volkern.com'}/api/canva/callback`;

    // Intercambiar el código por un access token
    const tokenData = await exchangeCodeForToken(
      code,
      canvaOAuth.codeVerifier,
      clientId,
      clientSecret,
      redirectUri
    );

    // Guardar el access token en la base de datos
    await prisma.user.update({
      where: { id: user.id },
      data: {
        metadata: {
          ...(metadata || {}),
          canvaAuth: {
            accessToken: tokenData.access_token,
            tokenType: tokenData.token_type,
            expiresIn: tokenData.expires_in,
            refreshToken: tokenData.refresh_token,
            timestamp: new Date().toISOString(),
          },
          // Limpiar los datos temporales de OAuth
          canvaOAuth: null,
        },
      },
    });

    // Registrar en audit log
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        tenantId: user.tenantId,
        accion: 'canva_oauth_success',
        entidad: 'integration',
        entidadId: user.id,
        descripcion: 'Usuario autenticado exitosamente con Canva',
      },
    });

    // Redirigir al dashboard de campañas con éxito
    return NextResponse.redirect(
      `${process.env.NEXTAUTH_URL || 'https://volkern.com'}/dashboard/campanas?canva_connected=true`
    );

  } catch (error: any) {
    console.error('Error en callback de Canva:', error);
    return NextResponse.redirect(
      `${process.env.NEXTAUTH_URL || 'https://volkern.com'}/dashboard/campanas?error=callback_failed&details=${encodeURIComponent(error.message)}`
    );
  }
}

