export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withTenantAuth } from '@/lib/api-key-auth';
import { getConnector } from '@/lib/ads/connectors';
import { AdConnectSchema } from '@/lib/validation/schemas/ads';
import { disponibilidadAds, ADS_PLATFORM_ENV, type AdsPlatformKey } from '@/lib/ads/platform-env';
import type { AdPlatform } from '@/lib/ads/types';

/**
 * POST /api/ads/connect
 * Inicia el flujo OAuth para conectar una plataforma de anuncios.
 * Devuelve la URL de autorización a la que debe redirigirse al usuario.
 */
export const POST = withTenantAuth(async (req: Request, auth) => {
  try {
    const tenantId = auth.tenant!.id;

    const body = await req.json();
    const parsed = AdConnectSchema.pick({ platform: true, redirectUri: true }).safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'Datos inválidos',
          details: parsed.error.flatten().fieldErrors,
        },
        { status: 400 },
      );
    }

    const { platform, redirectUri } = parsed.data;

    // Sin credenciales de la app de anuncios no hay diálogo al que ir: se dice
    // qué falta en vez de devolver el error crudo del conector.
    const disponibilidad = disponibilidadAds(platform as AdsPlatformKey);
    if (!disponibilidad.configured) {
      return NextResponse.json(
        {
          code: 'setup_required',
          platform,
          missing: disponibilidad.missing,
          error: `${ADS_PLATFORM_ENV[platform as AdsPlatformKey].nombre} no tiene credenciales OAuth configuradas: falta ${disponibilidad.missing.join(', ')}`,
        },
        { status: 400 },
      );
    }

    // El `state` viaja con la plataforma además del tenant: el callback la
    // necesita después, y así el redirect_uri puede ser exactamente la URL
    // registrada en el proveedor (sin query string, que Google rechaza).
    const authUrl = await getConnector(platform as AdPlatform).getAuthUrl(
      `${tenantId}~${platform}`,
      redirectUri,
    );

    return NextResponse.json({ authUrl: authUrl.url, platform });
  } catch (error: any) {
    console.error('[ADS Connect] Error:', error);
    return NextResponse.json({ error: error.message || 'Error al iniciar conexión con la plataforma' }, { status: 500 });
  }
}, ['ads:manage']);
