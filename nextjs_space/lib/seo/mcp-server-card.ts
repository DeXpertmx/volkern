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
  version: '2.0.0',
  description:
    'MCP Server for Volkern CRM - Lead management, appointments, tasks, and WhatsApp messaging integration',
}

/** Tools expuestas por el MCP server (de mcp-server/src/index.ts) */
export const MCP_TOOLS = [
  'volkern_list_contacts',
  'volkern_get_contact',
  'volkern_create_contact',
  'volkern_update_contact',
  'volkern_delete_contact',
  'volkern_list_leads',
  'volkern_get_lead',
  'volkern_create_lead',
  'volkern_update_lead',
  'volkern_check_disponibilidad',
  'volkern_list_citas',
  'volkern_create_cita',
  'volkern_update_cita',
  'volkern_cita_accion',
  'volkern_list_catalogo',
  'volkern_get_catalogo_item',
  'volkern_create_catalogo_item',
  'volkern_update_catalogo_item',
  'volkern_search_catalogo',
  'volkern_list_servicios',
  'volkern_get_servicio',
  'volkern_create_task',
  'volkern_list_tasks',
  'volkern_complete_task',
  'volkern_send_whatsapp',
  'volkern_list_conversaciones',
  'volkern_list_interactions',
  'volkern_create_interaction',
  'volkern_list_notes',
  'volkern_create_note',
  'volkern_list_deals',
  'volkern_create_deal',
  'volkern_create_cotizacion',
  'volkern_list_ordenes_venta',
  'volkern_get_orden_venta',
  'volkern_create_orden_from_cotizacion',
  'volkern_create_contrato_from_cotizacion',
  'volkern_get_financial_dashboard',
  'volkern_verify_vault_integrity',
  'volkern_calculate_tax_provisions',
  'volkern_process_inventory_consumption',
  'volkern_get_inventory_health',
  'volkern_report_production_scrap',
]

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
