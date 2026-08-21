export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { resolvePublicBaseUrl } from '@/lib/seo/public-base-url'
import { buildMcpServerCard } from '@/lib/seo/mcp-server-card'

/**
 * /.well-known/mcp/server-card.json — MCP Server Card (SEP-1649).
 *
 * Tarjeta de descubrimiento del servidor MCP de Volkern. Declara el
 * serverInfo (name/version), el endpoint de transporte (Streamable HTTP en
 * /mcp) y las capabilities con las tools reales del MCP server.
 */
export async function GET(req: Request) {
  const baseUrl = resolvePublicBaseUrl(req)
  const card = buildMcpServerCard(baseUrl)

  return NextResponse.json(card, {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
      'Access-Control-Allow-Origin': '*',
    },
  })
}
