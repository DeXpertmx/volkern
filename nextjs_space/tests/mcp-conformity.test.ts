/**
 * Test de conformidad MCP: verifica que las tres superficies MCP del
 * proyecto — Server Card (/.well-known/mcp/server-card.json), endpoint
 * Streamable HTTP /mcp y el MCP server standalone (mcp-server/, SDK v2) —
 * anuncien exactamente las mismas tools, con inputSchemas reales, y
 * negocien las mismas versiones de protocolo.
 *
 * El catálogo compartido (mcp-server/src/tools-catalog.ts) es la fuente de
 * verdad: el standalone lo usa para registerTool y /mcp para tools/list.
 * El bloque final lanza el servidor standalone real compilado (dist/) por
 * stdio y compara su tools/list contra la card.
 */
import { describe, expect, it } from 'vitest'
import { existsSync } from 'node:fs'
import { spawn, type ChildProcess } from 'node:child_process'
import { createInterface } from 'node:readline'
import { fileURLToPath } from 'node:url'
import { MCP_SERVER_INFO, MCP_TOOLS, buildMcpServerCard } from '@/lib/seo/mcp-server-card'
import { VOLKERN_TOOLS } from '../mcp-server/src/tools-catalog'

const DIST = fileURLToPath(new URL('../mcp-server/dist/index.js', import.meta.url))
const CARD = buildMcpServerCard('https://volkern.app')

async function postMcp(payload: unknown): Promise<{ status: number; body: any }> {
  const { POST } = await import('@/app/mcp/route')
  const res = await POST(
    new Request('https://volkern.app/mcp', { method: 'POST', body: JSON.stringify(payload) })
  )
  const body = await res.json()
  return { status: res.status, body }
}

describe('Conformidad Server Card ↔ catálogo real del standalone', () => {
  it('la card lista exactamente las tools del catálogo (mismo orden y conjunto)', () => {
    expect(MCP_TOOLS.length).toBe(VOLKERN_TOOLS.length)
    expect(MCP_TOOLS).toEqual(VOLKERN_TOOLS.map((t) => t.name))
  })

  it('cada tool del catálogo tiene description e inputSchema JSON Schema válido', () => {
    for (const tool of VOLKERN_TOOLS) {
      expect(tool.description, `${tool.name}: description`).toBeTruthy()
      expect(tool.inputSchema.type, `${tool.name}: inputSchema.type`).toBe('object')
      const props = Object.keys(tool.inputSchema.properties ?? {})
      for (const req of tool.inputSchema.required ?? []) {
        expect(props, `${tool.name}: required "${req}" debe estar en properties`).toContain(req)
      }
    }
  })

  it('solo las tools deliberadamente sin argumentos van sin propiedades', () => {
    const noArgs = VOLKERN_TOOLS.filter((t) => Object.keys(t.inputSchema.properties ?? {}).length === 0)
    expect(noArgs.map((t) => t.name)).toEqual(['volkern_verify_vault_integrity'])
  })

  it('los inputSchemas son reales, no el stub {properties:{}} anterior', () => {
    const contacts = VOLKERN_TOOLS.find((t) => t.name === 'volkern_list_contacts')!
    expect(Object.keys(contacts.inputSchema.properties ?? {})).toEqual(['tipo', 'search', 'page', 'limit'])
    const scrap = VOLKERN_TOOLS.find((t) => t.name === 'volkern_report_production_scrap')!
    expect(scrap.inputSchema.required).toContain('evidenceUrl')
  })
})

describe('Conformidad endpoint /mcp ↔ card', () => {
  it('tools/list devuelve las mismas tools que la card, con inputSchema real (no stub)', async () => {
    const { body } = await postMcp({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} })
    expect(body.result.tools.map((t: any) => t.name)).toEqual(MCP_TOOLS)
    for (const tool of body.result.tools) {
      const catalog = VOLKERN_TOOLS.find((t) => t.name === tool.name)!
      // Conformidad exacta: el schema publicado es el del catálogo real
      expect(tool.inputSchema, `${tool.name}: inputSchema`).toEqual(catalog.inputSchema)
      expect(tool.description, `${tool.name}: description`).toBe(catalog.description)
    }
    // Spot-check de legibilidad: schemas reales, no el stub anterior
    const contacts = body.result.tools.find((t: any) => t.name === 'volkern_list_contacts')
    expect(Object.keys(contacts.inputSchema.properties)).toEqual(['tipo', 'search', 'page', 'limit'])
  })

  it('initialize responde con el serverInfo de la card y una protocolVersion anunciada', async () => {
    const { body } = await postMcp({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2025-11-25' },
    })
    expect(body.result.serverInfo).toEqual({ name: MCP_SERVER_INFO.name, version: MCP_SERVER_INFO.version })
    expect(CARD.transports[0].protocolVersions).toContain(body.result.protocolVersion)
  })

  it('negocia cada protocolVersion anunciada en la card y cae al default ante versiones no soportadas', async () => {
    for (const v of CARD.transports[0].protocolVersions) {
      const { body } = await postMcp({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: v } })
      expect(body.result.protocolVersion, `cliente pide ${v}`).toBe(v)
    }
    const { body } = await postMcp({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2020-01-01' },
    })
    expect(body.result.protocolVersion).toBe('2025-03-26')
  })

  it('tools/call exige autenticación (401) y rechaza tools desconocidas (-32602)', async () => {
    const unauth = await postMcp({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: 'volkern_list_contacts', arguments: {} },
    })
    expect(unauth.status).toBe(401)
    expect(unauth.body.error.code).toBe(-32000)

    const unknown = await postMcp({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: { name: 'volkern_no_existe', arguments: {} },
    })
    expect(unknown.body.error.code).toBe(-32602)
  })
})

// Última superficie: el servidor standalone REAL (dist compilado) por stdio.
// Se salta si aún no se ha compilado (npm run build en mcp-server/).
describe.skipIf(!existsSync(DIST))('Conformidad servidor standalone (stdio) ↔ card', () => {
  function startServer(): ChildProcess {
    return spawn(process.execPath, [DIST], {
      env: { ...process.env, VOLKERN_API_KEY: 'conformity-test', VOLKERN_API_URL: 'http://127.0.0.1:1' },
      stdio: ['pipe', 'pipe', 'pipe'],
    })
  }

  function rpc(child: ChildProcess, id: number, method: string, params?: unknown) {
    const rl = createInterface({ input: child.stdout! })
    return new Promise<any>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`timeout esperando ${method}`)), 20000)
      rl.on('line', (line) => {
        try {
          const msg = JSON.parse(line)
          if (msg?.id === id) {
            clearTimeout(timer)
            resolve(msg)
          }
        } catch {
          /* línea no JSON (banner): ignorar */
        }
      })
      child.stdin!.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n')
    })
  }

  function notify(child: ChildProcess, method: string) {
    child.stdin!.write(JSON.stringify({ jsonrpc: '2.0', method }) + '\n')
  }

  it('el standalone real registra exactamente las tools de la card y negocia 2025-06-18', async () => {
    const child = startServer()
    try {
      const init = await rpc(child, 1, 'initialize', {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 'conformity-test', version: '0' },
      })
      expect(init.result.protocolVersion).toBe('2025-06-18')
      expect(init.result.serverInfo.name).toBe('volkern-mcp-server')
      expect(init.result.serverInfo.version).toBe('2.0.0')
      notify(child, 'notifications/initialized')

      const list = await rpc(child, 2, 'tools/list', {})
      expect(list.result.tools.map((t: any) => t.name)).toEqual(MCP_TOOLS)
    } finally {
      child.kill()
    }
  }, 30000)
})
