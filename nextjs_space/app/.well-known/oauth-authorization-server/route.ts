export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { resolvePublicBaseUrl } from '@/lib/seo/public-base-url'
import { AVAILABLE_SCOPES } from '@/lib/api-keys'

/**
 * /.well-known/oauth-authorization-server — RFC 8414 (OAuth 2.0
 * Authorization Server Metadata).
 *
 * Volkern no expone un flujo OAuth 2.0 delegado: la emisión de credenciales
 * es administrativa por tenant (API keys / skill keys). Este documento
 * publica el issuer y el bloque `agent_auth` (registro de agentes) descrito
 * en /auth.md, con el register_uri real de creación de credenciales.
 */
export async function GET(req: Request) {
  const baseUrl = resolvePublicBaseUrl(req)

  const document = {
    issuer: baseUrl,
    scopes_supported: [...AVAILABLE_SCOPES],
    response_types_supported: [],
    grant_types_supported: ['client_credentials'],
    token_endpoint_auth_methods_supported: ['client_secret_post', 'client_secret_basic'],
    code_challenge_methods_supported: [],
    service_documentation: `${baseUrl}/docs/developers`,
    authorization_response_iss_parameter_supported: false,
    // Bloque de registro de agentes (ver /auth.md) — la emisión es
    // administrativa: un usuario con sesión crea la API key del tenant.
    agent_auth: {
      skill: `${baseUrl}/auth.md`,
      register_uri: `${baseUrl}/dashboard/developers`,
      register_methods: [
        {
          name: 'API Key de tenant',
          description:
            'Crea una API key con scopes granulares vía POST /api/api-keys o la consola de desarrolladores. La credencial se muestra una sola vez.',
          credential: 'api_key',
          transport: 'https',
          endpoint: `${baseUrl}/api/api-keys`,
          method: 'POST',
          auth_required: 'session',
        },
        {
          name: 'Skill Key de agente',
          description:
            'Crea una key con scope agent:skill para agentes de IA vía POST /api/users/me/skill-key. La credencial se muestra una sola vez.',
          credential: 'api_key',
          transport: 'https',
          endpoint: `${baseUrl}/api/users/me/skill-key`,
          method: 'POST',
          auth_required: 'session',
        },
      ],
    },
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
