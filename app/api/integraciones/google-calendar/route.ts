export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

/**
 * GET /api/integraciones/google-calendar
 * Obtiene el estado de la integración con Google Calendar para el tenant
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

    const tenantId = (session.user as any).tenantId;

    const integration = await prisma.googleCalendarIntegration.findFirst({
      where: { tenantId },
      select: {
        id: true,
        activo: true,
        calendarId: true,
        ultimaSync: true,
        totalCitasSincronizadas: true,
        errorUltimaSync: true,
        channelExpiration: true,
        createdAt: true,
        updatedAt: true
      }
    });

    if (!integration) {
      return NextResponse.json({
        connected: false,
        message: 'No hay integración configurada'
      });
    }

    return NextResponse.json({
      connected: true,
      integration: {
        ...integration,
        hasActiveChannel: integration.channelExpiration ? new Date(integration.channelExpiration) > new Date() : false
      }
    });
  } catch (error) {
    console.error('Error al obtener estado de Google Calendar:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
