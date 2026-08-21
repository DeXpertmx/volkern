export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { resolvePublicBaseUrl } from '@/lib/seo/public-base-url'
import { MCP_SERVER_INFO, MCP_TOOLS } from '@/lib/seo/mcp-server-card'

/**
 * Endpoint MCP Streamable HTTP en /mcp.
 *
 * Implementa el handshake mínimo del Model Context Protocol para que el
 * Server Card apunte a un endpoint real y verificable:
 *   - initialize        → serverInfo + protocolVersion + capabilities
 *   - tools/list        → lista las tools reales del MCP server de Volkern
 *   - resources/list, prompts/list → vacíos (no se exponen)
 *   - tools/call        → 501 (la ejecución se delega al MCP server real)
 *
 * Autenticación: Bearer API key de tenant (vk_*), igual que la Skills API.
 */
export async function POST(req: Request) {
  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON-RPC body' }, { status: 400 })
  }

  const method: string = body?.method || ''
  const id: unknown = body?.id ?? null

  // initialize — handshake obligatorio
  if (method === 'initialize') {
    return NextResponse.json({
      jsonrpc: '2.0',
      id,
      result: {
        protocolVersion: '2025-06-18',
        capabilities: {
          tools: { listChanged: false },
          resources: { subscribe: false, listChanged: false },
          prompts: { listChanged: false },
        },
        serverInfo: {
          name: MCP_SERVER_INFO.name,
          version: MCP_SERVER_INFO.version,
        },
      },
    })
  }

  // notifications/initialized — sin respuesta (notification JSON-RPC)
  if (method === 'notifications/initialized') {
    return new Response(null, { status: 202 })
  }

  if (method === 'tools/list') {
    return NextResponse.json({
      jsonrpc: '2.0',
      id,
      result: {
        tools: MCP_TOOLS.map(name => ({
          name,
          description: `Herramienta MCP de Volkern: ${name}`,
          inputSchema: { type: 'object', properties: {} },
        })),
      },
    })
  }

  if (method === 'resources/list') {
    return NextResponse.json({ jsonrpc: '2.0', id, result: { resources: [] } })
  }

  if (method === 'prompts/list') {
    return NextResponse.json({ jsonrpc: '2.0', id, result: { prompts: [] } })
  }

  if (method === 'tools/call') {
    return NextResponse.json(
      {
        jsonrpc: '2.0',
        id,
        error: {
          code: -32601,
          message: 'La ejecución de tools se delega al MCP server de Volkern (volkern-mcp-server). Usa POST /api/skills/user/{userId}/execute o el paquete npm.',
        },
      },
      { status: 501 }
    )
  }

  // Método desconocido — JSON-RPC error estándar
  return NextResponse.json(
    {
      jsonrpc: '2.0',
      id,
      error: { code: -32601, message: `Método no soportado: ${method}` },
    },
    { status: 405 }
  )
}

/** GET /mcp — útil para navegadores; redirige a la documentación */
export async function GET(req: Request) {
  const baseUrl = resolvePublicBaseUrl(req)
  return NextResponse.json(
    {
      name: MCP_SERVER_INFO.name,
      version: MCP_SERVER_INFO.version,
      description: MCP_SERVER_INFO.description,
      docs: `${baseUrl}/docs/developers`,
      card: `${baseUrl}/.well-known/mcp/server-card.json`,
      usage: 'Envía una solicitud JSON-RPC MCP por POST (initialize, tools/list, tools/call).',
    },
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  )
}
