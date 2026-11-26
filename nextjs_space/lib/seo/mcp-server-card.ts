/**
 * MCP Server Card de Volkern (SEP-1649/SEP-2127).
 *
 * Documento estático de descubrimiento para el servidor MCP de Volkern
 * (mcp-server/). Los datos reflejan el server.json real del proyecto
 * (nombre, versión, repo) y las tools expuestas por el MCP server.
 *
 * $schema apunta al schema del registro MCP con fecha (el mismo namespace
 * que usa mcp-server/server.json); la URL antigua de SEP-1649
 * (schemas/v1/server-card.schema.json) devuelve 404.
 */
export const MCP_SERVER_INFO = {
  name: 'io.github.DeXpertmx/mcp-volkern',
  version: '2.0.1',
  description:
    'MCP Server for Volkern CRM - Lead management, appointments, tasks, and WhatsApp messaging integration',
}

/**
 * Tools expuestas por el MCP server — DERIVADAS del catálogo compartido
 * (mcp-server/src/tools-catalog.ts), única fuente de verdad. Antes era una
 * lista de 43 nombres mantenida a mano y podía derivar en silencio del
 * catálogo real; un test de no-derivación (mcp-server-card.test.ts) lo
 * impide a partir de ahora.
 */
import { VOLKERN_TOOLS } from '../../mcp-server/src/tools-catalog'

export const MCP_TOOLS: string[] = VOLKERN_TOOLS.map((t) => t.name)

/**
 * Card en el formato esperado por /.well-known/mcp/server-card.json:
 * serverInfo, transport endpoint y capabilities.
 */
export function buildMcpServerCard(baseUrl: string) {
  return {
    $schema: 'https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json',
    name: MCP_SERVER_INFO.name,
    version: MCP_SERVER_INFO.version,
    description: MCP_SERVER_INFO.description,
    websiteUrl: `${baseUrl}/docs/developers`,
    repository: {
      url: 'https://github.com/DeXpertmx/mcp-volkern',
      source: 'github',
    },
    serverInfo: {
      name: MCP_SERVER_INFO.name,
      version: MCP_SERVER_INFO.version,
    },
    transports: [
      {
        type: 'streamable-http',
        endpoint: `${baseUrl}/mcp`,
        // 2026-07-28: spec actual (núcleo stateless). 2025-11-25/06-18/03-26:
        // versiones del handshake 2025 que el SDK v2 sigue negociando.
        protocolVersions: ['2026-07-28', '2025-11-25', '2025-06-18', '2025-03-26'],
      },
    ],
    capabilities: {
      tools: {
        listChanged: false,
        tools: MCP_TOOLS,
      },
      resources: {
        subscribe: false,
        listChanged: false,
      },
      prompts: {
        listChanged: false,
      },
    },
  }
}
