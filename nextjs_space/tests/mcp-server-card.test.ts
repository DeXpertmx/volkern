import { describe, expect, it } from 'vitest'
import { MCP_SERVER_INFO, MCP_TOOLS, buildMcpServerCard } from '@/lib/seo/mcp-server-card'
import { VOLKERN_TOOLS } from '../mcp-server/src/tools-catalog'

// NO-DERIVACIÓN: la card ya no lleva una lista a mano de nombres. Se deriva
// del catálogo compartido, pero el test pinza que sea exactamente el
// conjunto de tools del catálogo (ni una menos ni una de más).
describe('Server Card derivada del catálogo (sin listas paralelas)', () => {
  it('MCP_TOOLS es exactamente el conjunto de tools del catálogo compartido', () => {
    expect(MCP_TOOLS).toEqual(VOLKERN_TOOLS.map((t) => t.name))
  })

  it('la card anuncia las 43 tools reales en capabilities.tools', () => {
    const card = buildMcpServerCard('https://volkern.app')
    expect(card.capabilities.tools.tools).toEqual(VOLKERN_TOOLS.map((t) => t.name))
    expect(card.capabilities.tools.tools).toHaveLength(43)
  })
})

function withoutEnv(cb: () => Promise<void>) {
  const prev = process.env.NEXTAUTH_URL
  delete process.env.NEXTAUTH_URL
  return cb().finally(() => {
    if (prev === undefined) delete process.env.NEXTAUTH_URL
    else process.env.NEXTAUTH_URL = prev
  })
}

describe('/.well-known/mcp/server-card.json (MCP Server Card)', () => {
  it('sirve el card con HTTP 200 y serverInfo con name y version', async () => {
    await withoutEnv(async () => {
      const { GET } = await import('@/app/.well-known/mcp/server-card.json/route')
      const res = await GET(new Request('https://volkern.app/.well-known/mcp/server-card.json'))
      expect(res.status).toBe(200)
      expect((res.headers.get('content-type') || '')).toContain('application/json')
      const body = await res.json()
      expect(body.serverInfo.name).toBe(MCP_SERVER_INFO.name)
      expect(body.serverInfo.version).toBe(MCP_SERVER_INFO.version)
    })
  })

  it('incluye el transport endpoint del servidor MCP', async () => {
    await withoutEnv(async () => {
      const { GET } = await import('@/app/.well-known/mcp/server-card.json/route')
      const body = await (await GET(new Request('https://volkern.app/.well-known/mcp/server-card.json'))).json()
      expect(Array.isArray(body.transports)).toBe(true)
      expect(body.transports.length).toBeGreaterThanOrEqual(1)
      const t = body.transports[0]
      expect(t.type).toBe('streamable-http')
      expect(t.endpoint).toContain('https://volkern.app/mcp')
    })
  })

  it('lista capabilities con las tools reales del MCP server', async () => {
    await withoutEnv(async () => {
      const { GET } = await import('@/app/.well-known/mcp/server-card.json/route')
      const body = await (await GET(new Request('https://volkern.app/.well-known/mcp/server-card.json'))).json()
      expect(body.capabilities).toBeTruthy()
      expect(body.capabilities.tools).toBeTruthy()
      expect(body.capabilities.tools.tools.length).toBeGreaterThanOrEqual(1)
      // tools reales del mcp-server/src/index.ts
      expect(body.capabilities.tools.tools).toContain('volkern_create_lead')
      expect(body.capabilities.tools.tools).toContain('volkern_send_whatsapp')
    })
  })

  it('usa la URL pública (issuer), no el host interno', async () => {
    await withoutEnv(async () => {
      const card = buildMcpServerCard('https://volkern.app')
      expect(card.transports[0].endpoint).toBe('https://volkern.app/mcp')
      expect(card.websiteUrl).toContain('https://volkern.app')
    })
  })
})

describe('POST /mcp (handshake MCP Streamable HTTP)', () => {
  it('responde initialize con serverInfo y capabilities', async () => {
    await withoutEnv(async () => {
      const { POST } = await import('@/app/mcp/route')
      const res = await POST(
        new Request('https://volkern.app/mcp', {
          method: 'POST',
          body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }),
        })
      )
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.jsonrpc).toBe('2.0')
      expect(body.result.serverInfo.name).toBe(MCP_SERVER_INFO.name)
      expect(body.result.capabilities.tools).toBeTruthy()
    })
  })

  it('tools/list devuelve las tools reales', async () => {
    await withoutEnv(async () => {
      const { POST } = await import('@/app/mcp/route')
      const res = await POST(
        new Request('https://volkern.app/mcp', {
          method: 'POST',
          body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }),
        })
      )
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.result.tools.length).toBe(MCP_TOOLS.length)
      expect(body.result.tools.some((t: any) => t.name === 'volkern_create_cotizacion')).toBe(true)
    })
  })

  it('método desconocido devuelve error JSON-RPC', async () => {
    await withoutEnv(async () => {
      const { POST } = await import('@/app/mcp/route')
      const res = await POST(
        new Request('https://volkern.app/mcp', {
          method: 'POST',
          body: JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'nope', params: {} }),
        })
      )
      const body = await res.json()
      expect(body.error.code).toBe(-32601)
    })
  })

  it('ping responde result vacío (obligatorio por el protocolo base MCP)', async () => {
    await withoutEnv(async () => {
      const { POST } = await import('@/app/mcp/route')
      const res = await POST(
        new Request('https://volkern.app/mcp', {
          method: 'POST',
          body: JSON.stringify({ jsonrpc: '2.0', id: 7, method: 'ping' }),
        })
      )
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body).toEqual({ jsonrpc: '2.0', id: 7, result: {} })
    })
  })

  it('toda notificación notifications/* responde 202 sin cuerpo', async () => {
    await withoutEnv(async () => {
      const { POST } = await import('@/app/mcp/route')
      for (const method of ['notifications/initialized', 'notifications/cancelled']) {
        const res = await POST(
          new Request('https://volkern.app/mcp', {
            method: 'POST',
            body: JSON.stringify({ jsonrpc: '2.0', method, params: {} }),
          })
        )
        expect(res.status).toBe(202)
        expect(await res.text()).toBe('')
      }
    })
  })
})
