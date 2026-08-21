import { MetadataRoute } from 'next'
import { globalPrisma } from '@/lib/db'

export const dynamic = 'force-dynamic'
// Revalidar cada 10 min para reflejar publicaciones nuevas sin golpear la BD en cada petición
export const revalidate = 600

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || 'https://volkern.app').replace(/\/$/, '')

/** Rutas públicas estáticas de la app (fuera de landings de tenants). */
const STATIC_ROUTES: { path: string; changefreq?: MetadataRoute.Sitemap[number]['changeFrequency']; priority?: number }[] = [
  { path: '', priority: 1 },
  { path: '/precios', priority: 0.8 },
  { path: '/soluciones', priority: 0.8 },
  { path: '/ecosistema', priority: 0.7 },
  { path: '/signup', priority: 0.7 },
  { path: '/booking', priority: 0.6 },
  { path: '/privacy', priority: 0.3 },
  { path: '/terms', priority: 0.3 },
]

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries: MetadataRoute.Sitemap = STATIC_ROUTES.map((r) => ({
    url: `${APP_URL}${r.path}`,
    changeFrequency: r.changefreq || 'monthly',
    priority: r.priority ?? 0.5,
    lastModified: new Date(),
  }))

  try {
    // Todas las páginas publicadas, con el slug del tenant para construir la URL
    const pages = await globalPrisma.page.findMany({
      where: { estado: 'published' },
      select: {
        slug: true,
        tenantId: true,
        fechaActualizacion: true,
      },
    })

    if (pages.length) {
      const tenantIds = [...new Set(pages.map((p) => p.tenantId).filter(Boolean))] as string[]
      const tenants = await globalPrisma.tenant.findMany({
        where: { id: { in: tenantIds } },
        select: { id: true, slug: true },
      })
      const tenantBySlug = new Map(tenants.map((t) => [t.id, t.slug]))

      for (const page of pages) {
        const tenantSlug = page.tenantId ? tenantBySlug.get(page.tenantId) : null
        if (!tenantSlug) continue
        entries.push({
          url: `${APP_URL}/p/${tenantSlug}/${page.slug}`,
          changeFrequency: 'weekly',
          priority: 0.7,
          lastModified: page.fechaActualizacion || undefined,
        })
      }
    }
  } catch (err) {
    console.error('[sitemap] Error consultando páginas publicadas:', err)
    // Si la BD falla, al menos servimos las rutas estáticas
  }

  return entries
}
