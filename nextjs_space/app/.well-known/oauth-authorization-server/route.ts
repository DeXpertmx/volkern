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
    // Bloque de registro de agentes (estándar Auth.md, ver /auth.md) — la
    // emisión es administrativa: un usuario con sesión crea la API key del
    // tenant. Cada método describe cómo el agente obtiene su credencial.
    agent_auth: {
      skill: `${baseUrl}/auth.md`,
      register_uri: `${baseUrl}/dashboard/developers`,
      register_methods: [
        {
          type: 'api_key',
          uri: `${baseUrl}/api/api-keys`,
          description:
            'Crea una API key con scopes granulares (POST /api/api-keys o consola de desarrolladores). La credencial se muestra una sola vez y se usa en el header x-api-key o como Bearer.',
        },
        {
          type: 'api_key',
          uri: `${baseUrl}/api/users/me/skill-key`,
          description:
            'Crea una key con scope agent:skill para agentes de IA (POST /api/users/me/skill-key). La credencial se muestra una sola vez.',
        },
        {
          type: 'session',
          uri: `${baseUrl}/auth/login`,
          description:
            'Inicia sesión como usuario del tenant; el agente opera con la sesión autenticada del usuario.',
        },
      ],
      // Identidades soportadas por el estándar Auth.md (opcional pero
      // recomendado por el check). Volkern valida API keys emitidas por el
      // tenant (identity_assertion tipo id-jag / api key), sin identidades
      // anónimas.
      identity_types_supported: ['identity_assertion'],
      identity_assertion: {
        assertion_types_supported: ['urn:ietf:params:oauth:token-type:id-jag'],
        credential_types_supported: ['api_key'],
      },
      events_supported: ['revocation'],
      revocation_uri: `${baseUrl}/api/api-keys`,
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
