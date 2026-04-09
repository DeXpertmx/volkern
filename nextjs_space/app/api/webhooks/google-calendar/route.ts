export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { syncFromGoogleToVolkern } from '@/lib/google-calendar';

// Forzar renderizado dinámico

/**
 * POST /api/webhooks/google-calendar
 * Endpoint webhook para recibir notificaciones de Google Calendar
 * 
 * Google envía dos tipos de notificaciones:
 * 1. sync - Notificación inicial cuando se configura el canal
 * 2. exists - Notificación de cambios en eventos
 */
export async function POST(request: NextRequest) {
  try {
    // Headers que Google envía
    const channelId = request.headers.get('x-goog-channel-id');
    const resourceId = request.headers.get('x-goog-resource-id');
    const resourceState = request.headers.get('x-goog-resource-state');
    const resourceUri = request.headers.get('x-goog-resource-uri');
    const channelExpiration = request.headers.get('x-goog-channel-expiration');

    console.log('📡 Webhook recibido de Google Calendar:');
    console.log(`  Channel ID: ${channelId}`);
    console.log(`  Resource ID: ${resourceId}`);
    console.log(`  State: ${resourceState}`);
    console.log(`  Expiration: ${channelExpiration}`);

    // Validar que recibimos los headers necesarios
    if (!channelId || !resourceId || !resourceState) {
      console.log('⚠️ Webhook inválido: faltan headers');
      return NextResponse.json(
        { error: 'Missing required headers' },
        { status: 400 }
      );
    }

    // Buscar la integración correspondiente
    const integration = await prisma.googleCalendarIntegration.findFirst({
      where: {
        channelId,
        resourceId,
      },
    });

    if (!integration) {
      console.log('⚠️ Canal no encontrado en la base de datos');
      return NextResponse.json(
        { error: 'Channel not found' },
        { status: 404 }
      );
    }

    // Si es una notificación de "sync", solo confirmar recepción
    if (resourceState === 'sync') {
      console.log('✅ Notificación de sync recibida - canal configurado correctamente');
      return NextResponse.json({ success: true });
    }

    // Si es una notificación de cambios ("exists"), sincronizar eventos
    if (resourceState === 'exists') {
      console.log('🔄 Detectados cambios en Google Calendar, sincronizando...');

      // Ejecutar sincronización en background para no bloquear la respuesta
      // Google espera una respuesta rápida (< 10 segundos)
      syncFromGoogleToVolkern(integration.userId)
        .then(() => {
          console.log('✅ Sincronización completada exitosamente');
        })
        .catch((error: any) => {
          console.error('❌ Error en sincronización:', error.message);
        });

      // Responder inmediatamente a Google
      return NextResponse.json({ success: true });
    }

    // Otros estados (not_exists, etc.)
    console.log(`📦 Estado desconocido: ${resourceState}`);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('❌ Error procesando webhook de Google Calendar:', error.message);

    // Siempre devolver 200 a Google para evitar reintentos
    return NextResponse.json(
      { error: error.message },
      { status: 200 }
    );
  }
}

/**
 * GET /api/webhooks/google-calendar
 * Endpoint para verificación del webhook
 * Google puede hacer un GET para verificar que el endpoint existe
 */
export async function GET(request: NextRequest) {
  return NextResponse.json({
    status: 'active',
    service: 'volkern-google-calendar-webhook',
    timestamp: new Date().toISOString(),
  });
}
