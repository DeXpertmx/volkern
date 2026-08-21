import { describe, expect, it } from 'vitest'

describe('/.well-known/api-catalog (RFC 9727)', () => {
  it('sirve el catálogo en formato linkset con las relaciones requeridas', async () => {
    const { GET } = await import('@/app/.well-known/api-catalog/route')
    const res = await GET(new Request('https://volkern.app/.well-known/api-catalog'))

    expect(res.status).toBe(200)
    const contentType = res.headers.get('content-type') || ''
    expect(contentType).toContain('application/linkset+json')
    expect(contentType).toContain('profile="https://www.rfc-editor.org/info/rfc9727"')

    const body = await res.json()
    expect(Array.isArray(body.linkset)).toBe(true)
    expect(body.linkset.length).toBeGreaterThanOrEqual(1)

    // Cada entrada tiene anchor y al menos service-desc
    for (const entry of body.linkset) {
      expect(typeof entry.anchor).toBe('string')
      expect(Array.isArray(entry['service-desc'])).toBe(true)
      expect(entry['service-desc'].length).toBeGreaterThanOrEqual(1)
    }
  })

  it('la entrada principal apunta a openapi.json, docs y health', async () => {
    const { GET } = await import('@/app/.well-known/api-catalog/route')
    const res = await GET(new Request('https://volkern.app/.well-known/api-catalog'))
    const body = await res.json()

    const main = body.linkset[0]
    expect(main.anchor).toBe('https://volkern.app/')
    expect(main['service-desc'][0].href).toBe('https://volkern.app/openapi.json')
    expect(main['service-desc'][0].type).toBe('application/openapi+json')
    expect(main['service-doc'].some((d: any) => d.href.includes('/docs/'))).toBe(true)
    expect(main.status?.[0]?.href).toBe('https://volkern.app/api/health')
  })

  it('incluye el Link header con rel=api-catalog en GET y HEAD', async () => {
    const mod = await import('@/app/.well-known/api-catalog/route')
    const res = await mod.GET(new Request('https://volkern.app/.well-known/api-catalog'))
    expect(res.headers.get('link') || '').toContain('rel="api-catalog"')

    const headRes = await mod.HEAD()
    expect(headRes.status).toBe(200)
    expect(headRes.headers.get('link') || '').toContain('rel="api-catalog"')
  })
})

describe('GET /api/health', () => {
  it('responde 200 con status ok y checks.database', async () => {
    const { GET } = await import('@/app/api/health/route')
    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBe('ok')
    expect(body.checks?.database).toBe('ok')
    expect(typeof body.latencyMs).toBe('number')
  })
})
