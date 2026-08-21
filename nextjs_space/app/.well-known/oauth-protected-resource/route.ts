export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { resolvePublicBaseUrl } from '@/lib/seo/public-base-url'
import { AVAILABLE_SCOPES } from '@/lib/api-keys'

/**
 * /.well-known/oauth-protected-resource — RFC 9728 (OAuth 2.0 Protected
 * Resource Metadata).
 *
 * Describe el servidor de recursos de Volkern: qué scopes existen y cómo se
 * presentan las credenciales (header). La emisión de credenciales es
 * administrativa (API keys por tenant), no OAuth delegado — ver /auth.md.
 */
export async function GET(req: Request) {
  const baseUrl = resolvePublicBaseUrl(req)

  const document = {
    resource: baseUrl,
    authorization_servers: [baseUrl],
    scopes_supported: [...AVAILABLE_SCOPES],
    bearer_methods_supported: ['header'],
  }

  return NextResponse.json(document, {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
      'Access-Control-Allow-Origin': '*',
    },
  })
}
