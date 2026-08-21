import { NextRequest, NextResponse } from 'next/server'
import { globalPrisma } from '@/lib/db'
import { APP_URL, searchStaticPages, PublicPageHit } from '@/lib/seo/webmcp'

export const dynamic = 'force-dynamic'

/**
 * GET /api/public/search?q=...&limit=...
 * Búsqueda pública sobre el sitemap: rutas estáticas + páginas publicadas de tenants.
 * Pensado para tools de agentes (WebMCP) y consumidores externos.
 */
export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get('q') || '').trim()
  const limit = Math.min(Math.max(Number(req.nextUrl.searchParams.get('limit')) || 5, 1), 20)

  if (!q) {
    return NextResponse.json({ error: 'q es requerido' }, { status: 400 })
  }

  const results: PublicPageHit[] = searchStaticPages(q)

  try {
    const pages = await globalPrisma.page.findMany({
      where: { estado: 'published' },
      select: { slug: true, tenantId: true, titulo: true, descripcion: true },
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
        const haystack = `${page.slug} ${page.titulo || ''} ${page.descripcion || ''}`.toLowerCase()
        if (haystack.includes(q.toLowerCase())) {
          results.push({
            url: `${APP_URL}/p/${tenantSlug}/${page.slug}`,
            title: page.titulo || page.slug,
            description: page.descripcion || '',
          })
        }
      }
    }
  } catch (err) {
    console.error('[public/search] Error consultando páginas:', err)
  }

  return NextResponse.json({
    query: req.nextUrl.searchParams.get('q'),
    total: results.length,
    results: results.slice(0, limit),
  })
}
