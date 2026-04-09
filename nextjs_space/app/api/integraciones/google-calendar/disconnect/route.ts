export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { stopWebhookChannel } from '@/lib/google-calendar';

/**
 * POST /api/integraciones/google-calendar/disconnect
 * Desconecta la integración con Google Calendar
 * Limpia AMBAS tablas: GoogleCalendarIntegration e Integration
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user || !(session.user as any).tenantId) {
      return NextResponse.json(
        { error: 'No autenticado' },
        { status: 401 }
      );
    }

    const userId = (session.user as any).id;
    const tenantId = (session.user as any).tenantId;
    let deletedOAuth = false;
    let deletedIntegration = false;

    // 1. Verificar y eliminar de GoogleCalendarIntegration (OAuth tokens)
    const existingOAuthIntegration = await prisma.googleCalendarIntegration.findFirst({
      where: { userId },
    });

    if (existingOAuthIntegration) {
      // Detener el canal webhook si existe
      try {
        await stopWebhookChannel(userId);
        console.log('✅ Canal webhook detenido');
      } catch (webhookError: any) {
        console.error('⚠️ Error al detener webhook (no crítico):', webhookError.message);
      }

      // Eliminar la integración OAuth
      await prisma.googleCalendarIntegration.delete({
        where: { userId },
      });
      deletedOAuth = true;
      console.log('✅ GoogleCalendarIntegration eliminada para usuario:', userId);
    }

    // 2. También eliminar de la tabla Integration (credenciales estáticas)
    const deletedFromIntegration = await prisma.integration.deleteMany({
      where: {
        tenantId,
        tipo: 'google_calendar'
      },
    });

    if (deletedFromIntegration.count > 0) {
      deletedIntegration = true;
      console.log('✅ Integration (google_calendar) eliminada para tenant:', tenantId);
    }

    if (!deletedOAuth && !deletedIntegration) {
      console.log('ℹ️ No había integración de Google Calendar para tenant:', tenantId);
    }

    return NextResponse.json({
      success: true,
      message: 'Google Calendar desconectado correctamente',
      details: {
        deletedOAuth,
        deletedIntegration
      }
    });
  } catch (error: any) {
    console.error('❌ Error al desconectar Google Calendar:', error.message);
    return NextResponse.json(
      { error: 'Error al desconectar', details: error.message },
      { status: 500 }
    );
  }
}
