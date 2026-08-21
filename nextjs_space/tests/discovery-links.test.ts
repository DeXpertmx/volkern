import { describe, expect, it } from 'vitest'
import { DISCOVERY_LINK_HEADERS, applyDiscoveryLinks } from '@/lib/seo/discovery-links'

describe('applyDiscoveryLinks (RFC 8288 / RFC 9727 §3)', () => {
  it('añade Link headers con las relaciones registradas en la homepage', () => {
    const headers = new Headers()
    applyDiscoveryLinks(headers, '/')

    const links = headers.get('Link') ?? ''
    expect(links).toContain('</.well-known/api-catalog>; rel="api-catalog"')
    expect(links).toContain('</openapi.json>; rel="service-desc"; type="application/openapi+json"')
    expect(links).toContain('</docs/developers>; rel="service-doc"; type="text/html"')
    expect(links).toContain('</openapi.json>; rel="describedby"; type="application/openapi+json"')
  })

  it('usa relaciones registradas (api-catalog, service-desc, service-doc, describedby)', () => {
    const rels = DISCOVERY_LINK_HEADERS.map(l => l.rel)
    for (const expected of ['api-catalog', 'service-desc', 'service-doc', 'describedby']) {
      expect(rels).toContain(expected)
    }
  })

  it('aplica también a otras páginas HTML (pricing, landings, booking)', () => {
    for (const p of ['/pricing', '/p/networking/prelaunch', '/booking/bruno', '/dashboard']) {
      const headers = new Headers()
      applyDiscoveryLinks(headers, p)
      expect(headers.get('Link') ?? '').toContain('rel="api-catalog"')
    }
  })

  it('no aplica a rutas API, .well-known, assets ni OPTIONS', () => {
    const cases = [
      ['/api/health', undefined],
      ['/.well-known/api-catalog', undefined],
      ['/logo.png', undefined],
      ['/_next/static/chunk.js', undefined],
      ['/', 'OPTIONS'],
    ]
    for (const [p, method] of cases) {
      const headers = new Headers()
      applyDiscoveryLinks(headers, p as string, method as string | undefined)
      expect(headers.get('Link'), `${p} no debería tener Link`).toBeNull()
    }
  })
})
