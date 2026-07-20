export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withTenantAuth } from '@/lib/api-key-auth';
import { getConnector } from '@/lib/ads/connectors';
import { AdConnectSchema } from '@/lib/validation/schemas/ads';
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

    // Obtener la URL de autorización del conector correspondiente
    const authUrl = await getConnector(platform as AdPlatform).getAuthUrl(tenantId, redirectUri);

    return NextResponse.json({ authUrl: authUrl.url, platform });
  } catch (error: any) {
    console.error('[ADS Connect] Error:', error);
    return NextResponse.json({ error: error.message || 'Error al iniciar conexión con la plataforma' }, { status: 500 });
  }
}, ['ads:manage']);
