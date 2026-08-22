export const dynamic = 'force-dynamic'

/**
 * /robots.txt — con directivas Content-Signal
 *
 * Sustituye a app/robots.ts (MetadataRoute) porque ese formato no permite
 * directivas custom. Este route handler sirve el texto completo:
 *
 *   - Reglas de acceso por User-agent (mismo contenido que antes)
 *   - Content-Signal: preferencias de uso de contenido por agentes de IA
 *     (https://contentsignals.org/ — draft-romm-aipref-contentsignals)
 *       · ai-train = no   → no permitir entrenar modelos con el contenido
 *       · search   = yes  → sí permitir indexar y mostrar en resultados
 *       · ai-input = no   → no permitir RAG / respuestas generativas con el contenido
 *   - Sitemap
 */
export async function GET() {
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://volkern.app').replace(/\/$/, '')

  const body = [
    '# Volkern robots.txt',
    '# Content-Signal: preferencias de uso de contenido por agentes de IA',
    '# https://contentsignals.org/',
    '',
    'User-agent: *',
    'Allow: /',
    'Allow: /p/',
    'Allow: /sitemap.xml',
    'Allow: /api/public/',
    'Disallow: /dashboard',
    'Disallow: /admin',
    'Disallow: /api/!public',
    'Disallow: /_next/',
    'Disallow: /member/',
    'Disallow: /academy/',
    '',
    'User-agent: GPTBot',
    'User-agent: OAI-SearchBot',
    'User-agent: ChatGPT-User',
    'User-agent: ClaudeBot',
    'User-agent: Anthropic-ai',
    'User-agent: PerplexityBot',
    'User-agent: Google-Extended',
    'User-agent: Gemini-Crawler',
    'Allow: /',
    'Allow: /p/',
    'Allow: /api/public/',
    'Disallow: /dashboard',
    'Disallow: /admin',
    'Disallow: /api/',
    '',
    'Content-Signal: ai-train=no, search=yes, ai-input=no',
    '',
    `Sitemap: ${appUrl}/sitemap.xml`,
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
