import { NextResponse } from 'next/server'
import { searchStaticPages } from '@/lib/seo/webmcp'
import { withX402 } from '@/lib/payments/x402'

export const dynamic = 'force-dynamic'

async function paidSearch(request: Request): Promise<NextResponse> {
  const url = new URL(request.url)
  const q = (url.searchParams.get('q') || '').trim()
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 5, 1), 20)

  if (!q) {
    return NextResponse.json({ error: 'q es requerido' }, { status: 400 })
  }

  const results = searchStaticPages(q).slice(0, limit)
  return NextResponse.json({
    query: q,
    total: results.length,
    results,
    payment: 'x402',
  })
}

/**
 * GET /api/public/paid-search?q=...
 *
 * Requires a valid x402 PAYMENT-SIGNATURE after the 402 challenge. The route
 * stays unconfigured (503) until X402_PAY_TO is supplied in the environment;
 * no fake wallet or implicit charge destination is used.
 */
export const GET = withX402(paidSearch, {
  resource: 'https://volkern.app/api/public/paid-search',
})
