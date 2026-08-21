import { describe, expect, it } from 'vitest'

function withoutEnv(cb: () => Promise<void>) {
  const prev = process.env.NEXTAUTH_URL
  delete process.env.NEXTAUTH_URL
  return cb().finally(() => {
    if (prev === undefined) delete process.env.NEXTAUTH_URL
    else process.env.NEXTAUTH_URL = prev
  })
}

describe('/.well-known/agent-card.json (A2A Agent Card)', () => {
  it('sirve el card con HTTP 200 y JSON', async () => {
    await withoutEnv(async () => {
      const { GET } = await import('@/app/.well-known/agent-card.json/route')
      const res = await GET(new Request('https://volkern.app/.well-known/agent-card.json'))
      expect(res.status).toBe(200)
      expect((res.headers.get('content-type') || '')).toContain('application/json')
      const body = await res.json()
      expect(typeof body.name).toBe('string')
      expect(body.name.length).toBeGreaterThan(0)
      expect(typeof body.version).toBe('string')
      expect(typeof body.description).toBe('string')
    })
  })

  it('incluye supportedInterfaces con url y protocolBinding', async () => {
    await withoutEnv(async () => {
      const { GET } = await import('@/app/.well-known/agent-card.json/route')
      const body = await (await GET(new Request('https://volkern.app/.well-known/agent-card.json'))).json()
      expect(Array.isArray(body.supportedInterfaces)).toBe(true)
      expect(body.supportedInterfaces.length).toBeGreaterThanOrEqual(1)
      const iface = body.supportedInterfaces[0]
      expect(iface.url).toContain('https://volkern.app/')
      expect(typeof iface.protocolBinding).toBe('string')
      expect(iface.protocolBinding.length).toBeGreaterThan(0)
    })
  })

  it('lista capabilities y skills con id, name y description', async () => {
    await withoutEnv(async () => {
      const { GET } = await import('@/app/.well-known/agent-card.json/route')
      const body = await (await GET(new Request('https://volkern.app/.well-known/agent-card.json'))).json()
      expect(body.capabilities).toBeTruthy()
      expect(Array.isArray(body.skills)).toBe(true)
      expect(body.skills.length).toBeGreaterThanOrEqual(1)
      for (const skill of body.skills) {
        expect(typeof skill.id).toBe('string')
        expect(skill.id.length).toBeGreaterThan(0)
        expect(typeof skill.name).toBe('string')
        expect(skill.name.length).toBeGreaterThan(0)
        expect(typeof skill.description).toBe('string')
        expect(skill.description.length).toBeGreaterThan(0)
      }
    })
  })

  it('declara la extensión AP2 como merchant requerida', async () => {
    await withoutEnv(async () => {
      const { GET } = await import('@/app/.well-known/agent-card.json/route')
      const body = await (await GET(new Request('https://volkern.app/.well-known/agent-card.json'))).json()
      const ap2 = body.capabilities?.extensions?.find(
        (extension: { uri?: string }) => extension.uri === 'https://github.com/google-agentic-commerce/AP2/tree/v0.1.0'
      )

      expect(ap2).toBeTruthy()
      expect(ap2.required).toBe(true)
      expect(ap2.params.roles).toContain('merchant')
    })
  })

  it('declara securitySchemes de API key con URL real del issuer', async () => {
    await withoutEnv(async () => {
      const { GET } = await import('@/app/.well-known/agent-card.json/route')
      const body = await (await GET(new Request('https://volkern.app/.well-known/agent-card.json'))).json()
      expect(body.securitySchemes).toBeTruthy()
      // La URL del issuer debe ser la pública, no el host interno
      expect(body.supportedInterfaces[0].url).toContain('https://volkern.app')
      expect(body.url).toContain('https://volkern.app')
    })
  })
})
