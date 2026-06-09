export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { renewWebhookChannel } from '@/lib/google-calendar';

/**
 * GET /api/cron/google-calendar-renew
 * Renueva los canales webhook de Google Calendar que están próximos a expirar.
 * Debe ejecutarse cada 12 horas.
 * Protegido por CRON_SECRET en producción.
 *
 * Los canales de Google Calendar expiran después de máximo 7 días.
 * Renovamos canales que expiran en menos de 48 horas para dar margen.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (process.env.NODE_ENV === 'production' && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  try {
    console.log('🔄 [Cron] Iniciando renovación de canales webhook de Google Calendar...');

    // Buscar integraciones con canales próximos a expirar (< 48 horas)
    const now = new Date();
    const expirationThreshold = new Date(now.getTime() + 48 * 60 * 60 * 1000);

    const integrationsToRenew = await prisma.googleCalendarIntegration.findMany({
      where: {
        activo: true,
        channelId: { not: null },
        channelExpiration: {
          not: null,
          lte: expirationThreshold,
        },
      },
    });

    console.log(`📊 Encontradas ${integrationsToRenew.length} integraciones para renovar`);

    const results = {
      timestamp: now.toISOString(),
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

        console.log(`🔄 Renovando canal para usuario ${integration.userId} (expira en ${horasRestantes}h)`);

        // CORREGIDO: Usamos userId (no tenantId) como espera renewWebhookChannel
        await renewWebhookChannel(integration.userId);

        results.renovadas++;
        results.detalles.push({
          userId: integration.userId,
          tenantId: integration.tenantId,
          status: 'renovado',
          horasRestantes,
        });

        console.log(`✅ Canal renovado para usuario ${integration.userId}`);
      } catch (error: any) {
        console.error(`❌ Error renovando canal para usuario ${integration.userId}:`, error.message);
        results.errores++;
        results.detalles.push({
          userId: integration.userId,
          tenantId: integration.tenantId,
          status: 'error',
          mensaje: error.message,
        });

        // Marcar error en la integración
        await prisma.googleCalendarIntegration.update({
          where: { id: integration.id },
          data: { errorUltimaSync: `Cron renew error: ${error.message}` },
        }).catch(() => {});
      }
    }

    console.log(`✅ [Cron] Renovación completada: ${results.renovadas} exitosas, ${results.errores} errores`);

    return NextResponse.json({
      success: true,
      ...results,
    });
  } catch (error: any) {
    console.error('❌ [Cron] Error en renovación de canales:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
