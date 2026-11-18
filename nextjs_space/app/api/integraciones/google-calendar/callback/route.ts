export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { prisma } from '@/lib/db';
import { getTokensFromCode, setupWebhookChannel, createOAuth2Client } from '@/lib/google-calendar';

// Forzar renderizado dinámico para esta ruta de API

/**
 * GET /api/integraciones/google-calendar/callback
 * Callback de Google OAuth que recibe el código de autorización
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const code = searchParams.get('code');
    const state = searchParams.get('state'); // userId
    const error = searchParams.get('error');

    // Si el usuario rechazó el permiso
    if (error) {
      console.log('⚠️ Usuario rechazó permisos de Google Calendar');
      return NextResponse.redirect(
        new URL('/dashboard/citas?error=google_calendar_denied', process.env.NEXTAUTH_URL || 'https://volkern.app')
      );
    }

    if (!code || !state) {
      return NextResponse.redirect(
        new URL('/dashboard/citas?error=google_calendar_invalid', process.env.NEXTAUTH_URL || 'https://volkern.app')
      );
    }

    const userId = state;

    console.log('✅ Código de autorización recibido para usuario:', userId);

    // Obtener información del usuario para tener el tenantId
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { tenantId: true }
    });

    if (!user || !user.tenantId) {
      throw new Error('Usuario o tenant no encontrado');
    }

    const tenantId = user.tenantId;

    // Intercambiar el código por tokens
    const tokens = await getTokensFromCode(code);

    if (!tokens.access_token) {
      throw new Error('Google no devolvió access token');
    }

    // Google solo entrega `refresh_token` la primera vez (o si se fuerza el
    // consentimiento). Al reconectar conservamos el que ya teníamos.
    const existente = await prisma.googleCalendarIntegration.findUnique({
      where: { userId },
      select: { refreshToken: true },
    })
    const refreshToken = tokens.refresh_token || existente?.refreshToken

    if (!refreshToken) {
      throw new Error('Google no devolvió refresh token. Vuelve a conectar la cuenta.')
    }

    console.log('✅ Tokens obtenidos de Google');

    // Obtener el calendario principal del usuario
    const oauth2Client = createOAuth2Client();
    oauth2Client.setCredentials({
      access_token: tokens.access_token,
      refresh_token: refreshToken,
    });

    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

    // Obtener lista de calendarios para encontrar el principal
    let calendarId = 'primary'; // Default
    try {
      const calendarList = await calendar.calendarList.list();
      const primaryCalendar = calendarList.data.items?.find(cal => cal.primary === true);
      if (primaryCalendar?.id) {
        calendarId = primaryCalendar.id;
        console.log('📅 Calendario principal encontrado:', calendarId);
      }
    } catch (calError: any) {
      console.log('⚠️ Usando calendario "primary" por defecto:', calError.message);
    }

    // Guardar o actualizar la integración en la base de datos
    const expiresAt = tokens.expiry_date
      ? new Date(tokens.expiry_date)
      : new Date(Date.now() + 3600 * 1000); // 1 hora por defecto

    await prisma.googleCalendarIntegration.upsert({
      where: { userId },
      create: {
        userId,
        tenantId,
        accessToken: tokens.access_token,
        refreshToken,
        expiresAt,
        calendarId,
        activo: true,
      },
      update: {
        accessToken: tokens.access_token,
        refreshToken,
        expiresAt,
        calendarId,
        activo: true,
        errorUltimaSync: null,
      },
    });

    console.log('✅ Integración de Google Calendar guardada para usuario:', userId);

    // Configurar webhook para sincronización bidireccional
    try {
      await setupWebhookChannel(userId);
      console.log('✅ Canal webhook configurado automáticamente');
    } catch (webhookError: any) {
      console.error('⚠️ Error al configurar webhook (no crítico):', webhookError.message);
      // No bloqueamos la autenticación si falla el webhook
    }

    // Refrescar la lista de calendarios conectados desde Google
    try {
      const { refreshConnectedCalendarsList } = await import('@/lib/google-calendar');
      await refreshConnectedCalendarsList(userId);
      console.log('✅ Lista de calendarios conectados guardada');
    } catch (calError: any) {
      console.error('⚠️ Error al guardar lista de calendarios (no crítico):', calError.message);
    }

    // Redirigir al usuario de vuelta a la página de citas
    return NextResponse.redirect(
      new URL('/dashboard/citas?success=google_calendar_connected', process.env.NEXTAUTH_URL || 'https://volkern.app')
    );
  } catch (error: any) {
    console.error('❌ Error en callback de Google Calendar:', error.message);
    console.error('Stack:', error.stack);

    // Propaga el motivo real para que la UI no muestre un error genérico
    // (p. ej. "The provided client secret is invalid").
    const motivo = encodeURIComponent(String(error?.message || 'error_desconocido').slice(0, 160));
    return NextResponse.redirect(
      new URL(
        `/dashboard/citas?error=google_calendar_error&reason=${motivo}`,
        process.env.NEXTAUTH_URL || 'https://volkern.app'
      )
    );
  }
}
