import { describe, expect, it } from 'vitest'
import { ACP_PROTOCOL_VERSION, ACP_SERVICES, buildAcpDiscoveryDocument } from '@/lib/seo/acp-discovery'

function withoutEnv(cb: () => Promise<void>) {
  const previous = process.env.NEXTAUTH_URL
  delete process.env.NEXTAUTH_URL
  return cb().finally(() => {
    if (previous === undefined) delete process.env.NEXTAUTH_URL
    else process.env.NEXTAUTH_URL = previous
  })
}

describe('/.well-known/acp.json (ACP discovery)', () => {
  it('sirve HTTP 200 con el contrato mínimo de ACP', async () => {
    await withoutEnv(async () => {
      const { GET } = await import('@/app/.well-known/acp.json/route')
      const response = await GET(new Request('https://volkern.app/.well-known/acp.json'))

      expect(response.status).toBe(200)
      expect(response.headers.get('content-type') || '').toContain('application/json')

      const body = await response.json()
      expect(body.protocol).toEqual({ name: 'acp', version: ACP_PROTOCOL_VERSION })
      expect(body.api_base_url).toBe('https://volkern.app/api')
      expect(new URL(body.api_base_url).protocol).toMatch(/^https?:$/)
      expect(Array.isArray(body.transports)).toBe(true)
      expect(body.transports.length).toBeGreaterThan(0)
      expect(Array.isArray(body.capabilities?.services)).toBe(true)
      expect(body.capabilities.services.length).toBeGreaterThan(0)
      expect(body.capabilities.services).toEqual(ACP_SERVICES)
    })
  })

  it('construye URLs públicas y no expone hosts internos', () => {
    const document = buildAcpDiscoveryDocument('https://volkern.app')

    expect(document.api_base_url).toBe('https://volkern.app/api')
    expect(document.service_endpoints.catalog).toBe('https://volkern.app/api/catalogo/items')
    expect(document.service_endpoints.quotes).toBe('https://volkern.app/api/cotizaciones')
    expect(document.service_endpoints['sales-orders']).toBe('https://volkern.app/api/ordenes-venta')
  })

  it('resuelve la URL pública configurada aunque el request llegue por Docker', async () => {
    const previous = process.env.NEXTAUTH_URL
    process.env.NEXTAUTH_URL = 'https://volkern.app'
    try {
      const { GET } = await import('@/app/.well-known/acp.json/route')
      const response = await GET(new Request('http://0.0.0.0:3000/.well-known/acp.json'))
      const body = await response.json()
      expect(body.api_base_url).toBe('https://volkern.app/api')
    } finally {
      if (previous === undefined) delete process.env.NEXTAUTH_URL
      else process.env.NEXTAUTH_URL = previous
    }
  })
})
