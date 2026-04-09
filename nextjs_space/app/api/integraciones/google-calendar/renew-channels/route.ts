export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { renewWebhookChannel } from '@/lib/google-calendar';

// Forzar renderizado dinámico

/**
 * POST /api/integraciones/google-calendar/renew-channels
 * Renueva automáticamente los canales de webhook que están próximos a expirar
 * 
 * Este endpoint debe ser llamado periódicamente (recomendado: cada 12 horas)
 * mediante un cron job o task scheduler externo
 * 
 * Los canales de Google Calendar expiran después de máximo 7 días
 * Renovamos canales que expiran en menos de 24 horas
 */
export async function POST(request: NextRequest) {
  try {
    console.log('🔄 Iniciando renovación de canales webhook...');

    // Buscar integraciones con canales próximos a expirar (< 24 horas)
    const now = new Date();
    const expirationThreshold = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 horas

    const integrationsToRenew = await prisma.googleCalendarIntegration.findMany({
      where: {
        activo: true,
        channelId: {
          not: null,
        },
        channelExpiration: {
          not: null,
          lte: expirationThreshold, // Expira en menos de 24 horas
        },
      },
    });

    console.log(`📊 Encontradas ${integrationsToRenew.length} integraciones para renovar`);

    const results = {
      total: integrationsToRenew.length,
      renovadas: 0,
      errores: 0,
      detalles: [] as any[],
    };

    for (const integration of integrationsToRenew) {
      try {
        const horasRestantes = Math.round(
          (integration.channelExpiration!.getTime() - now.getTime()) / (1000 * 60 * 60)
        );

        console.log(`🔄 Renovando canal para tenant ${integration.tenantId} (expira en ${horasRestantes}h)`);

        await renewWebhookChannel(integration.tenantId);

        results.renovadas++;
        results.detalles.push({
          tenantId: integration.tenantId,
          status: 'renovado',
          horasRestantes,
        });

        console.log(`✅ Canal renovado exitosamente para tenant ${integration.tenantId}`);
      } catch (error: any) {
        console.error(`❌ Error renovando canal para tenant ${integration.tenantId}:`, error.message);

        results.errores++;
        results.detalles.push({
          tenantId: integration.tenantId,
          status: 'error',
          mensaje: error.message,
        });

        // Marcar error en la integración
        await prisma.googleCalendarIntegration.update({
          where: { id: integration.id },
          data: {
            errorUltimaSync: `Error renovando webhook: ${error.message}`,
          },
        });
      }
    }

    console.log(`✅ Renovación completada: ${results.renovadas} exitosas, ${results.errores} errores`);

    return NextResponse.json({
      success: true,
      timestamp: now.toISOString(),
      ...results,
    });
  } catch (error: any) {
    console.error('❌ Error en renovación de canales:', error.message);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}

/**
 * GET /api/integraciones/google-calendar/renew-channels
 * Muestra el estado de los canales activos
 */
export async function GET(request: NextRequest) {
  try {
    const now = new Date();

    const activeChannels = await prisma.googleCalendarIntegration.findMany({
      where: {
        activo: true,
        channelId: {
          not: null,
        },
      },
      select: {
        tenantId: true,
        channelId: true,
        channelExpiration: true,
        ultimaSync: true,
      },
    });

    const channelsWithStatus = activeChannels.map((channel) => {
      const horasRestantes = channel.channelExpiration
        ? Math.round((channel.channelExpiration.getTime() - now.getTime()) / (1000 * 60 * 60))
        : null;

      return {
        tenantId: channel.tenantId,
        channelId: channel.channelId,
        expiracion: channel.channelExpiration,
        horasRestantes,
        necesitaRenovacion: horasRestantes !== null && horasRestantes < 24,
        ultimaSync: channel.ultimaSync,
      };
    });

    return NextResponse.json({
      timestamp: now.toISOString(),
      totalCanales: activeChannels.length,
      canalesActivos: channelsWithStatus,
    });
  } catch (error: any) {
    console.error('❌ Error obteniendo estado de canales:', error.message);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
