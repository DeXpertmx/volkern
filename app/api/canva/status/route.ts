export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

/**
 * Verifica el estado de la conexión con Canva
 * GET /api/canva/status
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.email) {
      return NextResponse.json({ connected: false, needsAuth: true });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    });

    if (!user) {
      return NextResponse.json({ connected: false, needsAuth: true });
    }

    const metadata = user.metadata as any;
    const canvaAuth = metadata?.canvaAuth;

    if (!canvaAuth || !canvaAuth.accessToken) {
      return NextResponse.json({
        connected: false,
        needsAuth: true,
      });
    }

    // Verificar si el token ha expirado
    const tokenTimestamp = new Date(canvaAuth.timestamp).getTime();
    const expiresAt = tokenTimestamp + (canvaAuth.expiresIn * 1000);
    const now = Date.now();

    const isExpired = now >= expiresAt;

    return NextResponse.json({
      connected: true,
      needsAuth: false,
      hasRefreshToken: !!canvaAuth.refreshToken,
      isExpired,
      expiresAt: new Date(expiresAt).toISOString(),
    });

  } catch (error: any) {
    console.error('Error al verificar estado de Canva:', error);
    return NextResponse.json(
      { connected: false, error: error.message },
      { status: 500 }
    );
  }
}

