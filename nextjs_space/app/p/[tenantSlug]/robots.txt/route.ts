export const dynamic = 'force-dynamic';

import { NextRequest } from 'next/server';
import { resolveTenantBySlug } from '@/lib/real-estate/portal-utils';
import { baseUrlDePeticion, textoRobots } from '@/lib/real-estate/portal-seo';

/**
 * robots.txt por cuenta.
 *
 * El portal vive bajo `/p/<slug>` y una cuenta de baja no debería seguir
 * apareciendo en Google con sus fichas: se le cierra el rastreo entero.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ tenantSlug: string }> }
) {
  const { tenantSlug } = await params;
  const base = baseUrlDePeticion(req.headers);

  try {
    const tenant = await resolveTenantBySlug(tenantSlug);
    if (!tenant) {
      return new Response('Not found', { status: 404 });
    }

    const texto = textoRobots({
      base,
      tenantSlug,
      indexable: tenant.estado === 'activo',
    });

    return new Response(texto, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'public, max-age=600, stale-while-revalidate=86400',
      },
    });
  } catch (error) {
    console.error('[Portal Robots] Error:', error);
    return new Response(textoRobots({ base, tenantSlug, indexable: true }), {
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }
}
