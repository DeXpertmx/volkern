export const dynamic = 'force-dynamic'

/**
 * /.well-known/security.txt — RFC 9116
 *
 * Archivo de contacto para investigadores de seguridad. Cloudflare también
 * puede servirlo desde el edge; este route garantiza que el origen responda
 * en cualquier subdominio o dominio personalizado.
 *
 * La política completa vive en /security (página pública).
 */
export async function GET(req: Request) {
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || 'volkern.app'
  const proto = req.headers.get('x-forwarded-proto') || 'https'
  const baseUrl = `${proto}://${host}`

  const body = [
    '# Volkern Security Contact',
    '# https://volkern.app',
    '',
    'Contact: mailto:security@dimensionexpert.com',
    `Policy: ${baseUrl}/security`,
    `Canonical: ${baseUrl}/.well-known/security.txt`,
    'Expires: 2027-08-22T00:00:00.000Z',
    '',
    '# Preferencias:',
    '# - Usa el email de contacto para reportar vulnerabilidades.',
    '# - Incluye pasos de reproducción, impacto estimado y capturas.',
    '# - No explotes más allá de lo necesario para demostrar el hallazgo.',
    '',
  ].join('\n')

  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
      'Access-Control-Allow-Origin': '*',
    },
  })
}

export async function HEAD() {
  return new Response(null, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
    },
  })
}
