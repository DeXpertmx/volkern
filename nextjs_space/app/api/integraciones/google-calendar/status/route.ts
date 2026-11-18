export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

/**
 * GET /api/integraciones/google-calendar/status
 * Obtiene el estado de la integración con Google Calendar
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

    const userId = (session.user as any).id;

    const integration = await prisma.googleCalendarIntegration.findFirst({
      where: { userId },
      select: {
        activo: true,
        calendarId: true,
        ultimaSync: true,
        totalCitasSincronizadas: true,
        errorUltimaSync: true,
        expiresAt: true,
        createdAt: true,
      },
    });

    if (!integration) {
      return NextResponse.json({
        conectado: false,
        activo: false,
      });
    }

    return NextResponse.json({
      // `conectado` = hay una integración guardada; `activo` = además es
      // utilizable (un token revocado la deja conectada pero inactiva, y el
      // panel de integraciones necesita distinguir ambos casos para ofrecer
      // «Reconectar» en vez de borrar la fila).
      conectado: true,
      activo: integration.activo,
      calendarId: integration.calendarId,
      ultimaSync: integration.ultimaSync,
      totalCitasSincronizadas: integration.totalCitasSincronizadas,
      errorUltimaSync: integration.errorUltimaSync,
      tokenExpiraEn: integration.expiresAt,
      conectadoDesde: integration.createdAt,
    });
  } catch (error: any) {
    console.error('❌ Error al obtener estado de Google Calendar:', error.message);
    return NextResponse.json(
      { error: 'Error al obtener estado', details: error.message },
      { status: 500 }
    );
  }
}
