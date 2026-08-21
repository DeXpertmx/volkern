export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { resolvePublicBaseUrl } from '@/lib/seo/public-base-url'

/**
 * /.well-known/api-catalog — RFC 9727
 *
 * Catálogo de APIs de Volkern para descubrimiento automático. Se sirve en
 * formato Linkset (RFC 9264) con `Content-Type: application/linkset+json`
 * y el profile del RFC 9727.
 *
 * Cada entrada usa el anchor de la API y las relaciones de RFC 8631:
 *   - service-desc → spec OpenAPI (consumo máquina)
 *   - service-doc  → documentación (consumo humano)
 *   - status       → health endpoint
 *
 * Ver Apéndice A.1 de https://www.rfc-editor.org/rfc/rfc9727
 */
export async function GET(req: Request) {
  const baseUrl = resolvePublicBaseUrl(req)

  const catalog = {
    linkset: [
      {
        anchor: `${baseUrl}/`,
        'service-desc': [
          {
            href: `${baseUrl}/openapi.json`,
            type: 'application/openapi+json',
          },
        ],
        'service-doc': [
          {
            href: `${baseUrl}/docs/developers`,
            type: 'text/html',
          },
          {
            href: `${baseUrl}/docs/redoc`,
            type: 'text/html',
          },
        ],
        status: [
          {
            href: `${baseUrl}/api/health`,
            type: 'application/json',
          },
        ],
      },
      {
        anchor: `${baseUrl}/api/skills/user/{userId}`,
        'service-desc': [
          {
            href: `${baseUrl}/api/skills/user/{userId}/openapi.yaml`,
            type: 'application/yaml',
          },
        ],
        'service-doc': [
          {
            href: `${baseUrl}/api/skills/user/{userId}/SKILL.md`,
            type: 'text/markdown',
          },
        ],
        status: [
          {
            href: `${baseUrl}/api/health`,
            type: 'application/json',
          },
        ],
      },
      {
        anchor: `${baseUrl}/.well-known/agent-skills`,
        'service-doc': [
          {
            href: `${baseUrl}/.well-known/agent-skills/index.json`,
            type: 'application/json',
          },
        ],
      },
    ],
  }

  return NextResponse.json(catalog, {
    status: 200,
    headers: {
      'Content-Type': 'application/linkset+json; profile="https://www.rfc-editor.org/info/rfc9727"',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
      Link: `<${baseUrl}/.well-known/api-catalog>; rel="api-catalog"`,
      'Access-Control-Allow-Origin': '*',
    },
  })
}

/** HEAD — el RFC exige responder HEAD con el Link header de rel=api-catalog */
export async function HEAD() {
  return new Response(null, {
    status: 200,
    headers: {
      Link: `</.well-known/api-catalog>; rel="api-catalog"`,
      'Content-Type': 'application/linkset+json',
    },
  })
}
