import { NextRequest, NextResponse } from 'next/server'
import { globalPrisma, getTenantDb, dbContext } from '@/lib/db'
import { resolveTenantBySlug } from '@/lib/real-estate/portal-utils'
import { pageToMarkdown } from '@/lib/seo/ai-crawlers'

export const dynamic = 'force-dynamic'

/**
 * GET /api/seo/markdown?tenantSlug=...&pageSlug=...
 *
 * Devuelve la landing publicada como Markdown limpio (text/markdown) para
 * que los crawlers de IA no tengan que parsear el HTML denso. El middleware
 * reescribe las peticiones de GPTBot/ClaudeBot/PerplexityBot/... a esta ruta.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const tenantSlug = searchParams.get('tenantSlug')
  const pageSlug = searchParams.get('pageSlug')

  if (!tenantSlug || !pageSlug) {
    return new NextResponse('Faltan parámetros', { status: 400, headers: { 'Content-Type': 'text/plain' } })
  }

  const tenant = await resolveTenantBySlug(tenantSlug)
  if (!tenant) {
    return new NextResponse('No encontrado', { status: 404, headers: { 'Content-Type': 'text/plain' } })
  }

  const { client: tenantClient } = await getTenantDb(tenant.id)
  const page = await dbContext.run({ tenantId: tenant.id, client: tenantClient }, async () => {
    return await tenantClient.page.findFirst({
      where: { slug: pageSlug, estado: 'published' },
    })
  })

  if (!page) {
    return new NextResponse('No encontrado', { status: 404, headers: { 'Content-Type': 'text/plain' } })
  }

  const markdown = pageToMarkdown(page as any)

  return new NextResponse(markdown, {
    status: 200,
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Cache-Control': 'public, max-age=300, s-maxage=300',
      'X-Robots-Tag': 'noindex, follow',
    },
  })
}

// Evitar que el runtime edge intente usar APIs de Node no disponibles
export const runtime = 'nodejs'
