export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getAuthUrl } from '@/lib/google-calendar';

// Forzar renderizado dinámico para esta ruta de API

/**
 * GET /api/integraciones/google-calendar/auth
 * Inicia el flujo de autenticación OAuth 2.0 con Google Calendar
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user || !(session.user as any).tenantId) {
      return NextResponse.json(
        { error: 'No autenticado' },
        { status: 401 }
      );
    }

    const authUrl = getAuthUrl((session.user as any).id);

    console.log('🔗 URL de autenticación de Google generada:', authUrl.substring(0, 100) + '...');

    // Redirigir al usuario a la página de autenticación de Google
    return NextResponse.redirect(authUrl);
  } catch (error: any) {
    console.error('❌ Error al generar URL de autenticación:', error.message);
    return NextResponse.json(
      { error: 'Error al iniciar autenticación', details: error.message },
      { status: 500 }
    );
  }
}
