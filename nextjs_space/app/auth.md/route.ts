export const dynamic = 'force-dynamic'
import { resolvePublicBaseUrl } from '@/lib/seo/public-base-url'

const AUTH_MD = (baseUrl: string) => `# auth.md

Documento de descubrimiento de autenticación y registro de agentes para Volkern
(CRM/ERP multi-tenant). Define cómo un agente de IA (o cliente HTTP) obtiene
credenciales y autentica contra las APIs de Volkern.

## Audiencia

Este documento está dirigido a:

- **Agentes de IA** (LLM, asistentes, automatizaciones) que quieren operar las
  APIs de Volkern (Partner API v1, Skills API, MCP) en nombre de un usuario o
  tenant.
- **Integradores** (ERPs, POS, e-commerce, n8n, GitHub Actions) que consumen
  endpoints autenticados.

Volkern **no** expone un flujo OAuth 2.0 de autorización delegada para agentes.
La emisión de credenciales es **administrativa**: un usuario con sesión crea la
API key (o la credencial de skill) dentro de su tenant. Consulta también
\`/.well-known/oauth-protected-resource\` para los scopes del servidor de recursos.

## Registro / aprovisionamiento de credenciales

| Método | Endpoint de registro | Audiencia |
|---|---|---|
| API Key de tenant | \`POST /api/api-keys\` (sesión) o UI \`/dashboard/developers\` | Integradores SaaS (ERPs, POS, e-commerce) |
| Skill Key de agente | \`POST /api/users/me/skill-key\` (sesión) | Agentes de IA (Gemma, Gemini, asistentes) con scope \`agent:skill\` |

Pasos para registrar un agente:

1. Inicia sesión en ${baseUrl}/dashboard/developers como usuario del tenant.
2. Crea una API Key (\`POST /api/api-keys\`) con los scopes que el agente
   necesite (p.ej. \`leads:read\`, \`invoices:write\`), o una Skill Key
   (\`POST /api/users/me/skill-key\`) con scope \`agent:skill\` para agentes de IA.
3. La credencial se muestra **una sola vez** en la respuesta: guárdala de forma
   segura. En la BD solo se persiste el hash SHA-256.

## Métodos de autenticación soportados

Todas las APIs autenticadas aceptan **una** de estas formas (ambas usan la misma
API key):

### 1. Header \`x-api-key\` (recomendado)

\`\`\`http
GET ${baseUrl}/api/v1/partner/invoices
x-api-key: vk_prod_<64-hex>
\`\`\`

### 2. Header \`Authorization: Bearer\` con API key

\`\`\`http
GET ${baseUrl}/api/leads
Authorization: Bearer vk_prod_<64-hex>
\`\`\`

Formato de la credencial: \`vk_prod_\` o \`vk_live_\` seguido de 64 caracteres
hexadecimales. \`Bearer\` con un JWT de la app móvil de cliente se valida por
separado (secreto de firma distinto).

### 3. Server-to-server (cron/scripts)

Los procesos internos (cron, n8n, GitHub Actions) usan \`Authorization: Bearer
<CRON_SECRET>\` con el \`tenantId\` explícito en el body cuando no hay sesión.

## Uso de credenciales

- **Scopes**: la API key lleva scopes granulares (p.ej. \`leads:read\`,
  \`invoices:write\`, \`agent:skill\`). El servidor responde \`403\` si el scope
  no cubre la operación.
- **Tenant**: la key está ligada al tenant del usuario que la creó. Para
  actuar sobre otro tenant se requiere jerarquía (superadmin/agencia) vía
  \`X-Impersonate-Tenant-Id\`.
- **Revocación**: desactivar la key en \`/dashboard/developers\` o eliminar el
  registro en BD invalida la credencial inmediatamente (el hash deja de
  coincidir).
- **Auditoría**: cada uso actualiza \`ultimoUso\` / \`totalUsos\` de la key.

## Descubrimiento relacionado

- Catálogo de APIs: \`${baseUrl}/.well-known/api-catalog\`
- Servidor de recursos (scopes y métodos bearer): \`${baseUrl}/.well-known/oauth-protected-resource\`
- Spec OpenAPI: \`${baseUrl}/openapi.json\`
- Documentación: \`${baseUrl}/docs/developers\`
- Health: \`${baseUrl}/api/health\`

## Seguridad

- Las claves solo se muestran una vez al crearlas; no existe endpoint para
  recuperarlas.
- No uses claves de producción (\`vk_prod_\`) en clientes no confiables.
- Los webhooks de Volkern verifican firmas HMAC/secret compartido según la
  integración; nunca envíes credenciales en URLs.
`

export async function GET() {
  const baseUrl = resolvePublicBaseUrl(new Request('https://volkern.app'))
  return new Response(AUTH_MD(baseUrl), {
    status: 200,
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
      'Access-Control-Allow-Origin': '*',
    },
  })
}
