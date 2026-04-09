import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

const GOCARDLESS_CLIENT_ID = 'ZLJoa6pYTjWeup3H9U6tV7DLlMG0VqD9GOa3tuZ0yNU6nBbjUG7jI5ncBKSmVloY';
const GOCARDLESS_CLIENT_SECRET = 'gPt1e2hpGZ4fUpSmCNP0Xaj-Gg3wXrRACoNffhiaeBailkM7fCHJ5k1LS15LeSHT';

/**
 * Procesa el callback de GoCardless Connect
 * Intercambia el código por el token de acceso
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');

    if (error) {
      console.error('[GoCardless Callback] OAuth Error:', error);
      return NextResponse.redirect(new URL('/dashboard/integraciones?error=gocardless_failed', request.url));
    }

    if (!code || !state) {
      return NextResponse.json({ error: 'Parámetros inválidos' }, { status: 400 });
    }

    // Parsear el state para obtener tenant y entorno
    const { tenantId, environment } = JSON.parse(state);

    if (!tenantId) throw new Error('Tenant no identificado');

    // Cambiar código por Access Token (Usar subdominio connect)
    const tokenUrl = environment === 'live'
      ? 'https://connect.gocardless.com/oauth/access_token'
      : 'https://connect-sandbox.gocardless.com/oauth/access_token';

    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: GOCARDLESS_CLIENT_ID,
        client_secret: GOCARDLESS_CLIENT_SECRET,
        code,
        grant_type: 'authorization_code',
        redirect_uri: `${request.nextUrl.origin}/api/integrations/gocardless/callback`,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('[GoCardless Callback] Token Exchange Error:', data);
      throw new Error('Error al intercambiar el token');
    }

    // Guardar integración en la base de datos para el tenant
    await prisma.integration.upsert({
      where: {
        tenantId_tipo: {
          tenantId,
          tipo: 'gocardless'
        }
      },
      create: {
        tenantId,
        tipo: 'gocardless',
        nombre: 'GoCardless Connect',
        credenciales: {
          accessToken: data.access_token,
          organisationId: data.organisation_id,
          environment,
          connectedAt: new Date().toISOString()
        },
        activo: true,
        conectado: true
      },
      update: {
        credenciales: {
          accessToken: data.access_token,
          organisationId: data.organisation_id,
          environment,
          connectedAt: new Date().toISOString()
        },
        activo: true,
        conectado: true,
        fechaActualizacion: new Date()
      }
    });

    // Redirigir a la landing page de éxito
    return NextResponse.redirect(new URL('/dashboard/integraciones/gocardless/success', request.url));
  } catch (error) {
    console.error('[GoCardless Callback] Error:', error);
    return NextResponse.redirect(new URL('/dashboard/integraciones?error=gocardless_error', request.url));
  }
}
