import { describe, expect, it } from 'vitest'

describe('/.well-known/api-catalog (RFC 9727)', () => {
  /** Aisla NEXTAUTH_URL para que estos tests ejerciten req.url / x-forwarded */
  function withoutEnv(cb: () => Promise<void>) {
    const prev = process.env.NEXTAUTH_URL
    delete process.env.NEXTAUTH_URL
    return cb().finally(() => {
      if (prev === undefined) delete process.env.NEXTAUTH_URL
      else process.env.NEXTAUTH_URL = prev
    })
  }

  it('sirve el catálogo en formato linkset con las relaciones requeridas', async () => {
    await withoutEnv(async () => {
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
  })

  it('la entrada principal apunta a openapi.json, docs y health', async () => {
    await withoutEnv(async () => {
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
  })

  it('incluye el Link header con rel=api-catalog en GET y HEAD', async () => {
    const mod = await import('@/app/.well-known/api-catalog/route')
    const res = await mod.GET(new Request('https://volkern.app/.well-known/api-catalog'))
    expect(res.headers.get('link') || '').toContain('rel="api-catalog"')

    const headRes = await mod.HEAD()
    expect(headRes.status).toBe(200)
    expect(headRes.headers.get('link') || '').toContain('rel="api-catalog"')
  })

  it('usa NEXTAUTH_URL como base aunque el req.url sea el host interno de Docker', async () => {
    const prev = process.env.NEXTAUTH_URL
    process.env.NEXTAUTH_URL = 'https://volkern.app'
    try {
      const { GET } = await import('@/app/.well-known/api-catalog/route')
      const res = await GET(new Request('http://0.0.0.0:3000/.well-known/api-catalog'))
      const body = await res.json()
      expect(body.linkset[0].anchor).toBe('https://volkern.app/')
      expect(body.linkset[0]['service-desc'][0].href).toBe('https://volkern.app/openapi.json')
      expect(res.headers.get('link')).toContain('https://volkern.app/.well-known/api-catalog')
    } finally {
      if (prev === undefined) delete process.env.NEXTAUTH_URL
      else process.env.NEXTAUTH_URL = prev
    }
  })

  it('cae a x-forwarded-host cuando no hay NEXTAUTH_URL (dominios personalizados)', async () => {
    const prev = process.env.NEXTAUTH_URL
    delete process.env.NEXTAUTH_URL
    try {
      const { GET } = await import('@/app/.well-known/api-catalog/route')
      const res = await GET(new Request('http://0.0.0.0:3000/.well-known/api-catalog', {
        headers: {
          'x-forwarded-proto': 'https',
          'x-forwarded-host': 'erp.dimension.expert',
        },
      }))
      const body = await res.json()
      expect(body.linkset[0].anchor).toBe('https://erp.dimension.expert/')
    } finally {
      if (prev === undefined) delete process.env.NEXTAUTH_URL
      else process.env.NEXTAUTH_URL = prev
    }
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
