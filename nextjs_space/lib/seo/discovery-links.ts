/**
 * Descubrimiento de agentes: Link response headers (RFC 8288 + RFC 9727 §3).
 *
 * La homepage (y las páginas HTML en general) anuncia sus recursos
 * legibles por máquina con cabeceras `Link`, para que crawlers de IA y
 * clientes HTTP puedan descubrir el catálogo de APIs, el spec OpenAPI,
 * la documentación y la descripción del sistema sin rastrear el HTML.
 *
 * Relaciones registradas usadas:
 *   - api-catalog  (RFC 9727)   → /.well-known/api-catalog (linkset)
 *   - service-desc (RFC 8631)   → spec OpenAPI (consumo máquina)
 *   - service-doc  (RFC 8631)   → documentación (consumo humano)
 *   - describedby  (RFC 6892)   → descripción del recurso (spec OpenAPI)
 */
export interface DiscoveryLink {
  href: string
  rel: string
  type?: string
}

export const DISCOVERY_LINK_HEADERS: DiscoveryLink[] = [
  { href: '/.well-known/api-catalog', rel: 'api-catalog' },
  { href: '/openapi.json', rel: 'service-desc', type: 'application/openapi+json' },
  { href: '/docs/developers', rel: 'service-doc', type: 'text/html' },
  { href: '/openapi.json', rel: 'describedby', type: 'application/openapi+json' },
]

/**
 * Añade los Link headers de descubrimiento a una respuesta de página HTML.
 * Se omiten rutas API, assets de Next, el propio /.well-known (que ya
 * emite sus Link) y peticiones OPTIONS (preflight).
 */
export function applyDiscoveryLinks(headers: Headers, pathname: string, method?: string): void {
  if (!pathname) return
  if (method === 'OPTIONS') return
  if (pathname.startsWith('/api/')) return
  if (pathname.startsWith('/_next/')) return
  if (pathname.startsWith('/.well-known/')) return
  // Assets estáticos (con extensión) — solo páginas
  if (/\.\w+$/.test(pathname)) return

  for (const link of DISCOVERY_LINK_HEADERS) {
    let value = `<${link.href}>; rel="${link.rel}"`
    if (link.type) value += `; type="${link.type}"`
    headers.append('Link', value)
  }
}
