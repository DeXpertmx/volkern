export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getConnector } from '@/lib/ads/connectors';
import { AdPlatformSchema } from '@/lib/validation/schemas/ads';
import type { AdPlatform } from '@/lib/ads/types';

/**
 * GET /api/ads/connect/callback
 * Callback OAuth desde la plataforma de anuncios.
 * Recibe el código de autorización y completa la conexión.
 * Redirige al dashboard al finalizar.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const platformParam = searchParams.get('platform');
    const code = searchParams.get('code');
    const state = searchParams.get('state'); // tenantId
    const error = searchParams.get('error');
    const errorDescription = searchParams.get('error_description');

    // Si la plataforma devolvió un error (usuario canceló)
    if (error) {
      const dashboardUrl = new URL('/dashboard/ads', process.env.NEXTAUTH_URL || 'https://volkern.app');
      dashboardUrl.searchParams.set('oauth_error', error);
      if (errorDescription) {
        dashboardUrl.searchParams.set('oauth_error_description', errorDescription);
      }
      return NextResponse.redirect(dashboardUrl);
    }

    // Validar plataforma
    const platformValidation = AdPlatformSchema.safeParse(platformParam);
    if (!platformValidation.success || !code || !state) {
      const dashboardUrl = new URL('/dashboard/ads', process.env.NEXTAUTH_URL || 'https://volkern.app');
      dashboardUrl.searchParams.set('oauth_error', 'invalid_params');
      return NextResponse.redirect(dashboardUrl);
    }

    const platform = platformValidation.data;
    const tenantId = state;

    // Determinar redirectUri a partir de la URL pública (no de request.url,
    // que en el standalone de Next.js se reconstruye como 0.0.0.0:3000)
    const redirectUri = `${process.env.NEXTAUTH_URL || 'https://volkern.app'}/api/ads/connect/callback`;

    // Completar la conexión con el código de autorización
    await getConnector(platform as AdPlatform).connect(tenantId, {
      authCode: code,
      platform: platform as AdPlatform,
      redirectUri,
    });

    // Redirigir al dashboard con éxito
    const dashboardUrl = new URL('/dashboard/ads', process.env.NEXTAUTH_URL || 'https://volkern.app');
    dashboardUrl.searchParams.set('oauth_success', platform);
    return NextResponse.redirect(dashboardUrl);
  } catch (error: any) {
    console.error('[ADS Connect Callback] Error:', error);
    const dashboardUrl = new URL('/dashboard/ads', process.env.NEXTAUTH_URL || 'https://volkern.app');
    dashboardUrl.searchParams.set('oauth_error', 'connection_failed');
    dashboardUrl.searchParams.set('oauth_error_description', error.message);
    return NextResponse.redirect(dashboardUrl);
  }
}
