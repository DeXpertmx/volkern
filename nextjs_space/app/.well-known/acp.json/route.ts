export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { resolvePublicBaseUrl } from '@/lib/seo/public-base-url'
import { buildAcpDiscoveryDocument } from '@/lib/seo/acp-discovery'

/**
 * /.well-known/acp.json — Agentic Commerce Protocol discovery.
 *
 * Public metadata for agents: protocol version, transport, API base URL and
 * the commerce capabilities currently exposed by Volkern.
 */
export async function GET(req: Request) {
  const baseUrl = resolvePublicBaseUrl(req)

  return NextResponse.json(buildAcpDiscoveryDocument(baseUrl), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
      'Access-Control-Allow-Origin': '*',
    },
  })
}

export async function HEAD(req: Request) {
  const baseUrl = resolvePublicBaseUrl(req)

  return new Response(null, {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
      'Access-Control-Allow-Origin': '*',
      Link: `<${baseUrl}/.well-known/acp.json>; rel="service-desc"`,
    },
  })
}
