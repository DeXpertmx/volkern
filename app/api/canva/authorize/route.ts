export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { generateCodeVerifier, generateCodeChallenge, generateAuthorizationUrl } from '@/lib/canva-oauth';
import { prisma } from '@/lib/db';

/**
 * Inicia el flujo de autorización OAuth con Canva
 * GET /api/canva/authorize
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

    const clientId = process.env.NEXT_PUBLIC_CANVA_CLIENT_ID;
    
    if (!clientId) {
      return NextResponse.json(
        { error: 'NEXT_PUBLIC_CANVA_CLIENT_ID no configurado' },
        { status: 500 }
      );
    }

    // Generar code_verifier y code_challenge para PKCE
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = await generateCodeChallenge(codeVerifier);

    // Generar state para prevenir CSRF
    const state = generateCodeVerifier(); // Reutilizamos la función para generar un string aleatorio

    // Construir redirect_uri
    const redirectUri = `${process.env.NEXTAUTH_URL || 'https://volkern.com'}/api/canva/callback`;

    // Guardar el code_verifier y state en la sesión (o base de datos)
    // Por simplicidad, lo guardamos en la base de datos asociado al usuario
    await prisma.user.update({
      where: { id: user.id },
      data: {
        metadata: {
          ...(user.metadata as any || {}),
          canvaOAuth: {
            codeVerifier,
            state,
            timestamp: new Date().toISOString(),
          },
        },
      },
    });

    // Generar URL de autorización
    const authUrl = generateAuthorizationUrl(clientId, redirectUri, codeChallenge, state);

    // Redirigir al usuario a la página de autorización de Canva
    return NextResponse.redirect(authUrl);

  } catch (error: any) {
    console.error('Error al iniciar autorización de Canva:', error);
    return NextResponse.json(
      { error: 'Error al iniciar autorización', details: error.message },
      { status: 500 }
    );
  }
}

