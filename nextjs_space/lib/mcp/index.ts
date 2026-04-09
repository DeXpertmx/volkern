/**
 * Volkern MCP Module
 * Model Context Protocol Implementation
 * 
 * Exporta todo lo necesario para el servidor MCP
 */

export {
  MCP_TOOLS,
  MCP_SERVER_INFO,
  handleListTools,
  handleCallTool,
  handleServerInfo,
  type MCPTool,
  type MCPListToolsResponse,
  type MCPCallToolRequest,
  type MCPCallToolResponse,
} from './mcp-handler';

/**
 * Documentación de uso:
 * 
 * ## Listar Tools
 * GET /api/mcp
 * Headers: X-API-Key: <api_key>
 * 
 * Response:
 * {
 *   "success": true,
 *   "server": { "name": "volkern-crm", "version": "1.0.0" },
 *   "tools": [{ "name": "create_lead", "description": "...", "inputSchema": {...} }]
 * }
 * 
 * ## Ejecutar Tool
 * POST /api/mcp
 * Headers: X-API-Key: <api_key>
 * Body:
 * {
 *   "tool": "create_lead",
 *   "arguments": {
 *     "nombre": "Juan Pérez",
 *     "email": "juan@example.com"
 *   }
 * }
 * 
 * Response:
 * {
 *   "success": true,
 *   "tool": "create_lead",
 *   "result": { "id": "...", "nombre": "Juan Pérez", ... }
 * }
 * 
 * ## Formato MCP Estándar (JSON-RPC)
 * POST /api/mcp
 * Body:
 * {
 *   "jsonrpc": "2.0",
 *   "id": 1,
 *   "method": "tools/call",
 *   "params": {
 *     "name": "create_lead",
 *     "arguments": { ... }
 *   }
 * }
 */
