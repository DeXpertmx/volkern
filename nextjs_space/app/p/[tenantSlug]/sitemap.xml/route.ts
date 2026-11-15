export const dynamic = 'force-dynamic';

import { NextRequest } from 'next/server';
import { globalPrisma } from '@/lib/db';
import { whereCatalogoVigente } from '@/lib/real-estate/portal-vigencia';
import { resolveTenantBySlug } from '@/lib/real-estate/portal-utils';
import {
  baseUrlDePeticion,
  entradasSitemap,
  sitemapXml,
} from '@/lib/real-estate/portal-seo';

/**
 * Sitemap por cuenta: portada, catálogo, páginas publicadas e inmuebles activos.
 *
 * Es una ruta propia (`sitemap.xml`) y no el `sitemap.ts` global porque necesita
 * el slug del tenant, y el sitemap global lista ya las landings de todas las
 * cuentas. Aquí sólo aparece lo de esta oficina.
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

    // El sitemap sólo anuncia lo que el catálogo enseña: si una ficha se retiró
    // por falta de actualización, no se manda a Google a una página sin listado.
    const [paginas, inmuebles] = await Promise.all([
      globalPrisma.page.findMany({
        where: { tenantId: tenant.id, estado: 'published' },
        select: { slug: true, fechaActualizacion: true },
      }),
      globalPrisma.catalogoItem.findMany({
        where: await whereCatalogoVigente(tenant.id),
        select: { id: true, fechaActualizacion: true },
        orderBy: { fechaActualizacion: 'desc' },
        take: 5000,
      }),
    ]);

    const xml = sitemapXml(
      entradasSitemap({ base, tenantSlug, paginas, inmuebles })
    );

    return new Response(xml, {
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Cache-Control': 'public, max-age=600, stale-while-revalidate=86400',
      },
    });
  } catch (error) {
    console.error('[Portal Sitemap] Error:', error);
    // Un sitemap caído no debe romper el rastreo: al menos portada y catálogo.
    return new Response(sitemapXml(entradasSitemap({ base, tenantSlug })), {
      headers: { 'Content-Type': 'application/xml; charset=utf-8' },
    });
  }
}
