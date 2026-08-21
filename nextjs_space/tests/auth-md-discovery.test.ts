import { describe, expect, it } from 'vitest'

function withoutEnv(cb: () => Promise<void>) {
  const prev = process.env.NEXTAUTH_URL
  delete process.env.NEXTAUTH_URL
  return cb().finally(() => {
    if (prev === undefined) delete process.env.NEXTAUTH_URL
    else process.env.NEXTAUTH_URL = prev
  })
}

describe('/auth.md (Auth.md agent registration)', () => {
  it('sirve Markdown con H1 que contiene "auth.md"', async () => {
    await withoutEnv(async () => {
      const { GET } = await import('@/app/auth.md/route')
      const res = await GET()
      expect(res.status).toBe(200)
      const ct = res.headers.get('content-type') || ''
      expect(ct).toContain('text/markdown')
      const text = await res.text()
      // H1 que contiene "auth.md"
      const h1 = text.split('\n').find(l => l.startsWith('# '))
      expect(h1).toBeTruthy()
      expect(h1!.toLowerCase()).toContain('auth.md')
    })
  })

  it('documenta la audiencia de agentes y endpoints de registro reales', async () => {
    await withoutEnv(async () => {
      const { GET } = await import('@/app/auth.md/route')
      const text = await (await GET()).text()
      expect(text.toLowerCase()).toContain('agente')
      expect(text).toContain('/api/api-keys')
      expect(text).toContain('/api/users/me/skill-key')
      expect(text).toContain('/dashboard/developers')
      expect(text).toContain('vk_prod_')
      expect(text).toContain('x-api-key')
    })
  })
})

describe('/.well-known/oauth-protected-resource (RFC 9728)', () => {
  it('incluye resource, authorization_servers, scopes_supported y bearer_methods_supported con header', async () => {
    await withoutEnv(async () => {
      const { GET } = await import('@/app/.well-known/oauth-protected-resource/route')
      const res = await GET(new Request('https://volkern.app/.well-known/oauth-protected-resource'))
      expect(res.status).toBe(200)
      expect((res.headers.get('content-type') || '')).toContain('application/json')
      const body = await res.json()
      expect(body.resource).toBe('https://volkern.app')
      expect(Array.isArray(body.authorization_servers)).toBe(true)
      expect(body.authorization_servers).toContain('https://volkern.app')
      expect(Array.isArray(body.scopes_supported)).toBe(true)
      expect(body.scopes_supported).toContain('leads:read')
      expect(body.scopes_supported).toContain('agent:skill')
      expect(Array.isArray(body.bearer_methods_supported)).toBe(true)
      expect(body.bearer_methods_supported).toContain('header')
    })
  })
})

describe('/.well-known/oauth-authorization-server (RFC 8414)', () => {
  it('publica issuer válido y bloque agent_auth con skill y register_uri', async () => {
    await withoutEnv(async () => {
      const { GET } = await import('@/app/.well-known/oauth-authorization-server/route')
      const res = await GET(new Request('https://volkern.app/.well-known/oauth-authorization-server'))
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.issuer).toBe('https://volkern.app')
      expect(body.scopes_supported).toContain('invoices:write')
      expect(body.agent_auth).toBeTruthy()
      expect(body.agent_auth.skill).toBe('https://volkern.app/auth.md')
      expect(body.agent_auth.register_uri).toBe('https://volkern.app/dashboard/developers')
      expect(Array.isArray(body.agent_auth.register_methods)).toBe(true)
      expect(body.agent_auth.register_methods.length).toBeGreaterThanOrEqual(1)
      // Al menos un método completo: nombre, credencial, transporte y endpoint
      for (const m of body.agent_auth.register_methods) {
        expect(m.name).toBeTruthy()
        expect(m.credential).toBe('api_key')
        expect(m.transport).toBe('https')
        expect(m.endpoint).toContain('https://')
      }
    })
  })
})
