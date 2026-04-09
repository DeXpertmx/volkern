export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { refreshAccessToken } from '@/lib/canva-oauth';
import { prisma } from '@/lib/db';

/**
 * Obtiene el access token actual del usuario (refresca si es necesario)
 * GET /api/canva/token
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.email) {
      return NextResponse.json(
        { error: 'No autenticado' },
        { status: 401 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    });

    if (!user) {
      return NextResponse.json(
        { error: 'Usuario no encontrado' },
        { status: 404 }
      );
    }

    const metadata = user.metadata as any;
    const canvaAuth = metadata?.canvaAuth;

    if (!canvaAuth || !canvaAuth.accessToken) {
      return NextResponse.json(
        { error: 'Usuario no autenticado con Canva', needsAuth: true },
        { status: 401 }
      );
    }

    // Verificar si el token ha expirado (con margen de 5 minutos)
    const tokenTimestamp = new Date(canvaAuth.timestamp).getTime();
    const expiresAt = tokenTimestamp + (canvaAuth.expiresIn * 1000);
    const now = Date.now();
    const fiveMinutes = 5 * 60 * 1000;

    if (now >= expiresAt - fiveMinutes && canvaAuth.refreshToken) {
      // Token expirado o por expirar, refrescar
      const clientId = process.env.NEXT_PUBLIC_CANVA_CLIENT_ID;
      const clientSecret = process.env.CANVA_CLIENT_SECRET;

      if (!clientId || !clientSecret) {
        return NextResponse.json(
          { error: 'Credenciales de Canva no configuradas' },
          { status: 500 }
        );
      }

      try {
        const newTokenData = await refreshAccessToken(
          canvaAuth.refreshToken,
          clientId,
          clientSecret
        );

        // Actualizar token en la base de datos
        await prisma.user.update({
          where: { id: user.id },
          data: {
            metadata: {
              ...metadata,
              canvaAuth: {
                accessToken: newTokenData.access_token,
                tokenType: newTokenData.token_type,
                expiresIn: newTokenData.expires_in,
                refreshToken: newTokenData.refresh_token || canvaAuth.refreshToken,
                timestamp: new Date().toISOString(),
              },
            },
          },
        });

        return NextResponse.json({
          accessToken: newTokenData.access_token,
          expiresIn: newTokenData.expires_in,
          refreshed: true,
        });

      } catch (refreshError: any) {
        console.error('Error al refrescar token de Canva:', refreshError);
        return NextResponse.json(
          { error: 'Error al refrescar token', needsAuth: true },
          { status: 401 }
        );
      }
    }

    // Token aún válido
    return NextResponse.json({
      accessToken: canvaAuth.accessToken,
      expiresIn: canvaAuth.expiresIn,
      refreshed: false,
    });

  } catch (error: any) {
    console.error('Error al obtener token de Canva:', error);
    return NextResponse.json(
      { error: 'Error al obtener token', details: error.message },
      { status: 500 }
    );
  }
}

