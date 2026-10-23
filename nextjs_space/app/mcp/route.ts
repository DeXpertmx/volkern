export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { resolvePublicBaseUrl } from '@/lib/seo/public-base-url'
import { MCP_SERVER_INFO } from '@/lib/seo/mcp-server-card'
// Catálogo compartido con el MCP server standalone: única fuente de verdad
// de las 43 tools (nombres, descripciones e inputSchemas reales).
import { VOLKERN_TOOLS } from '../../mcp-server/src/tools-catalog'

/**
 * Endpoint MCP Streamable HTTP en /mcp.
 *
 * Implementa el handshake del Model Context Protocol para que el Server Card
 * apunte a un endpoint real y verificable:
 *   - initialize        → serverInfo + protocolVersion (negociada) + capabilities
 *   - tools/list        → catálogo real compartido con mcp-server/src/tools-catalog.ts
 *   - resources/list, prompts/list → vacíos (no se exponen)
 *   - tools/call        → ejecución REAL vía Skills (lib/mcp/mcp-handler.ts),
 *                         con autenticación obligatoria (Bearer API key vk_*
 *                         con scope mcp:execute), rate limit y audit log.
 *
 * Negociación de protocolVersion: se acepta cualquier versión anunciada en la
 * Server Card (transports[0].protocolVersions); si el cliente pide una no
 * soportada se responde con el DEFAULT_NEGOTIATED del SDK v2
 * (@modelcontextprotocol/server), 2025-03-26.
 *
 * Autenticación: solo tools/call exige credenciales (ejecuta operaciones de
 * negocio); initialize/tools/list son metadatos públicos, como exige el
 * descubrimiento MCP.
 */

// Espejo de transports[0].protocolVersions de la Server Card (SEP-2127).
const SUPPORTED_PROTOCOL_VERSIONS = ['2026-07-28', '2025-11-25', '2025-06-18', '2025-03-26'] as const
const DEFAULT_PROTOCOL_VERSION = '2025-03-26'

// El mapeo tool MCP → skill (resolveSkillName) vive en lib/mcp/mcp-handler.ts,
// compartido con handleCallTool (única fuente de verdad de aliases).

// ============== RATE LIMITING (igual que /api/mcp) ==============

const rateLimitMap = new Map<string, { count: number; resetTime: number }>()
const RATE_LIMIT = 100 // requests por minuto
const RATE_WINDOW = 60 * 1000

function checkRateLimit(identifier: string): boolean {
  const now = Date.now()
  const entry = rateLimitMap.get(identifier)
  if (!entry || now > entry.resetTime) {
    rateLimitMap.set(identifier, { count: 1, resetTime: now + RATE_WINDOW })
    return true
  }
  if (entry.count >= RATE_LIMIT) return false
  entry.count++
  return true
}

/** JSON-RPC error con status HTTP */
function jsonRpcError(id: unknown, code: number, message: string, status: number) {
  return NextResponse.json({ jsonrpc: '2.0', id, error: { code, message } }, { status })
}

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
    const requested: string | undefined = body?.params?.protocolVersion
    const negotiated = (SUPPORTED_PROTOCOL_VERSIONS as readonly string[]).includes(requested ?? '')
      ? requested
      : DEFAULT_PROTOCOL_VERSION
    return NextResponse.json({
      jsonrpc: '2.0',
      id,
      result: {
        protocolVersion: negotiated,
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

  // Toda notificación JSON-RPC (sin id) → 202 Accepted sin cuerpo, como
  // exige Streamable HTTP. Cubre notifications/initialized y cualquier otra
  // (cancelled, progress…) que mande un cliente como Lovable.
  if (method.startsWith('notifications/')) {
    return new Response(null, { status: 202 })
  }

  // ping — obligatorio en el protocolo base MCP: el receptor DEBE responder.
  // Usado como health check por hosts al dar de alta el servidor.
  if (method === 'ping') {
    return NextResponse.json({ jsonrpc: '2.0', id, result: {} })
  }

  if (method === 'tools/list') {
    return NextResponse.json({
      jsonrpc: '2.0',
      id,
      result: {
        tools: VOLKERN_TOOLS.map(({ name, description, inputSchema }) => ({
          name,
          description,
          inputSchema,
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
    const toolName: string | undefined = body?.params?.name
    const toolArgs: Record<string, unknown> = body?.params?.arguments ?? {}

    // Tool desconocida para este servidor — error de protocolo, no de ejecución.
    // Se acepta también el nombre legacy sin prefijo (create_task, create_note,
    // update_lead…), que es el que publica la documentación de /api/mcp: la
    // misma operación no puede fallar según la superficie MCP que la invoque.
    const catalogTool = toolName
      ? VOLKERN_TOOLS.find((t) => t.name === toolName)
        ?? VOLKERN_TOOLS.find((t) => t.name === `volkern_${toolName}`)
      : undefined
    if (!catalogTool) {
      return jsonRpcError(id, -32602, `Tool desconocida: ${toolName ?? '(vacía)'}`, 400)
    }

    // Autenticación obligatoria: tools/call ejecuta operaciones reales del CRM
    const { authenticateRequest } = await import('@/lib/api-key-auth')
    const auth = await authenticateRequest(req, ['mcp:execute'])
    if (!auth.valid) {
      return jsonRpcError(id, -32000, `No autorizado: ${auth.error ?? 'credenciales inválidas'}`, 401)
    }

    const identifier = auth.apiKey?.id ? `apikey:${auth.apiKey.id}` : auth.user?.id ? `user:${auth.user.id}` : 'unknown'
    if (!checkRateLimit(identifier)) {
      return jsonRpcError(id, -32000, 'Rate limit exceeded. Máximo 100 requests por minuto.', 429)
    }

    // Mapear al skill equivalente y ejecutar de verdad vía Skills.
    // Todas las tools del catálogo son ejecutables: handleCallTool valida
    // contra el inputSchema del catálogo y captura errores como isError.
    const { handleCallTool, resolveSkillName } = await import('@/lib/mcp/mcp-handler')
    const skillName = resolveSkillName(catalogTool.name)

    // Inyección de contexto de seguridad: el tenant autenticado manda
    // (evita cross-tenant aunque el cliente envíe otro tenantId).
    const result = await handleCallTool({
      name: skillName,
      arguments: {
        ...toolArgs,
        tenantId: auth.tenant?.id || toolArgs.tenantId,
        userId: toolArgs.userId || auth.user?.id,
        source: 'mcp',
      },
    })

    // Audit log (best-effort, igual que /api/mcp)
    try {
      const { prisma } = await import('@/lib/db')
      await prisma.auditLog.create({
        data: {
          tenantId: auth.tenant?.id || 'unknown',
          userId: auth.user?.id,
          accion: 'MCP_tool_execution',
          entidad: 'MCP',
          entidadId: catalogTool.name,
          descripcion: `MCP /mcp tools/call: ${catalogTool.name}`,
          metadata: {
            tool: catalogTool.name,
            requestedTool: toolName,
            skill: skillName,
            status: result.isError ? 'error' : 'success',
          },
        },
      })
    } catch (e) {
      console.error('[MCP /mcp] Audit log falló:', e)
    }

    return NextResponse.json({ jsonrpc: '2.0', id, result })
  }

  // Método desconocido — JSON-RPC error estándar
  return jsonRpcError(id, -32601, `Método no soportado: ${method}`, 405)
}

/** CORS preflight para clientes MCP cross-origin */
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key',
    },
  })
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
      usage: 'Envía una solicitud JSON-RPC MCP por POST (initialize, tools/list, tools/call con Bearer API key).',
    },
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  )
}
