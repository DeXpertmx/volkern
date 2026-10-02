#!/usr/bin/env node

// SDK v2 (@modelcontextprotocol/server) — implementa la spec MCP 2026-07-28.
// Servidor construido con McpServer + registerTool; los JSON Schemas del
// catálogo se convierten con fromJsonSchema (sin reescribirlos a zod).
// Transportes: stdio (Claude Desktop, Cursor…) y Streamable HTTP stateless
// en /mcp (VS Code, Cline, n8n). El transporte SSE de la spec 2025 fue
// retirado por la spec 2026-07-28.
import {
  McpServer,
  WebStandardStreamableHTTPServerTransport,
  fromJsonSchema,
} from "@modelcontextprotocol/server";
import type { JsonSchemaType } from "@modelcontextprotocol/server";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { createServer, IncomingMessage, ServerResponse } from "http";
import { Readable } from "stream";
import type { ReadableStream as WebReadableStream } from "stream/web";
import { VOLKERN_TOOLS } from "./tools-catalog.js";

// ============================================
// Configuration
// ============================================
const VOLKERN_API_URL = process.env.VOLKERN_API_URL || "https://volkern.app/api";
const VOLKERN_API_KEY = process.env.VOLKERN_API_KEY || "";
const TRANSPORT = (process.env.TRANSPORT || "stdio").toLowerCase();
const PORT = parseInt(process.env.PORT || "3001", 10);
const VERSION = "2.0.0";

if (!VOLKERN_API_KEY) {
  console.error("Error: VOLKERN_API_KEY environment variable is required");
  process.exit(1);
}

// ============================================
// API Helper
// ============================================
async function volkernRequest(
  endpoint: string,
  method: string = "GET",
  body?: Record<string, unknown>
): Promise<unknown> {
  const url = `${VOLKERN_API_URL}${endpoint}`;
  
  const options: RequestInit = {
    method,
    headers: {
      "Authorization": `Bearer ${VOLKERN_API_KEY}`,
      "Content-Type": "application/json",
    },
  };

  if (body && method !== "GET") {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);
  
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      `Volkern API Error (${response.status}): ${JSON.stringify(errorData)}`
    );
  }

  return response.json();
}

// ============================================
// Tool Handlers
// ============================================
async function handleToolCall(
  name: string,
  args: Record<string, unknown>
): Promise<unknown> {
  switch (name) {
    // CONTACTS
    case "volkern_list_contacts": {
      const params = new URLSearchParams();
      if (args.tipo) params.append("tipo", String(args.tipo));
      if (args.search) params.append("search", String(args.search));
      if (args.page) params.append("page", String(args.page));
      if (args.limit) params.append("limit", String(args.limit));
      return volkernRequest(`/contacts?${params.toString()}`);
    }
    case "volkern_get_contact":
      return volkernRequest(`/contacts/${args.contactId}`);
    case "volkern_create_contact":
      return volkernRequest("/contacts", "POST", args);
    case "volkern_update_contact": {
      const { contactId, ...data } = args;
      return volkernRequest(`/contacts/${contactId}`, "PATCH", data);
    }
    case "volkern_delete_contact":
      return volkernRequest(`/contacts/${args.contactId}`, "DELETE");

    // LEADS
    case "volkern_list_leads": {
      const params = new URLSearchParams();
      if (args.estado) params.append("estado", String(args.estado));
      if (args.canal) params.append("canal", String(args.canal));
      if (args.search) params.append("search", String(args.search));
      if (args.page) params.append("page", String(args.page));
      if (args.limit) params.append("limit", String(args.limit));
      return volkernRequest(`/leads?${params.toString()}`);
    }
    case "volkern_get_lead":
      return volkernRequest(`/leads/${args.leadId}`);
    case "volkern_create_lead":
      return volkernRequest("/leads", "POST", args);
    case "volkern_update_lead": {
      const { leadId, ...data } = args;
      return volkernRequest(`/leads/${leadId}`, "PATCH", data);
    }

    // APPOINTMENTS
    case "volkern_check_disponibilidad": {
      const params = new URLSearchParams();
      params.append("fecha", String(args.fecha));
      if (args.duracion) params.append("duracion", String(args.duracion));
      return volkernRequest(`/citas/disponibilidad?${params.toString()}`);
    }
    case "volkern_list_citas": {
      const params = new URLSearchParams();
      if (args.estado) params.append("estado", String(args.estado));
      if (args.tipo) params.append("tipo", String(args.tipo));
      if (args.fecha) params.append("fecha", String(args.fecha));
      if (args.fechaInicio) params.append("fechaInicio", String(args.fechaInicio));
      if (args.fechaFin) params.append("fechaFin", String(args.fechaFin));
      return volkernRequest(`/citas?${params.toString()}`);
    }
    case "volkern_create_cita":
      return volkernRequest("/citas", "POST", args);
    case "volkern_update_cita": {
      const { citaId, ...data } = args;
      return volkernRequest(`/citas/${citaId}`, "PATCH", data);
    }
    case "volkern_cita_accion":
      return volkernRequest("/citas/accion", "POST", args);

    // CATALOG (ENHANCED)
    case "volkern_list_catalogo": {
      const params = new URLSearchParams();
      if (args.tipo) params.append("tipo", String(args.tipo));
      if (args.activo !== undefined) params.append("activo", String(args.activo));
      if (args.categoria) params.append("categoria", String(args.categoria));
      if (args.etiqueta) params.append("etiqueta", String(args.etiqueta));
      if (args.search) params.append("search", String(args.search));
      if (args.page) params.append("page", String(args.page));
      if (args.limit) params.append("limit", String(args.limit));
      return volkernRequest(`/catalogo?${params.toString()}`);
    }
    case "volkern_get_catalogo_item":
      return volkernRequest(`/catalogo/${args.itemId}`);
    case "volkern_create_catalogo_item":
      return volkernRequest("/catalogo", "POST", args);
    case "volkern_update_catalogo_item": {
      const { itemId, ...data } = args;
      return volkernRequest(`/catalogo/${itemId}`, "PATCH", data);
    }
    case "volkern_search_catalogo": {
      const params = new URLSearchParams();
      params.append("search", String(args.query));
      if (args.tipo) params.append("tipo", String(args.tipo));
      if (args.limit) params.append("limit", String(args.limit));
      return volkernRequest(`/catalogo?${params.toString()}`);
    }

    // SERVICES (LEGACY)
    case "volkern_list_servicios": {
      const params = new URLSearchParams();
      if (args.activo !== undefined) params.append("activo", String(args.activo));
      return volkernRequest(`/servicios?${params.toString()}`);
    }
    case "volkern_get_servicio":
      return volkernRequest(`/servicios/${args.servicioId}`);

    // TASKS
    case "volkern_create_task": {
      const { leadId, ...taskData } = args;
      return volkernRequest(`/leads/${leadId}/tasks`, "POST", taskData);
    }
    case "volkern_list_tasks":
      return volkernRequest(`/leads/${args.leadId}/tasks`);
    case "volkern_complete_task":
      return volkernRequest(`/tasks/${args.taskId}`, "PATCH", { completada: true });

    // MESSAGING
    case "volkern_send_whatsapp":
      return volkernRequest("/mensajes/enviar", "POST", args);
    case "volkern_list_conversaciones": {
      const params = new URLSearchParams();
      if (args.leadId) params.append("leadId", String(args.leadId));
      if (args.page) params.append("page", String(args.page));
      if (args.limit) params.append("limit", String(args.limit));
      return volkernRequest(`/mensajes/conversaciones?${params.toString()}`);
    }

    // INTERACTIONS
    case "volkern_list_interactions":
      return volkernRequest(`/leads/${args.leadId}/interactions`);
    case "volkern_create_interaction": {
      const { leadId, ...interactionData } = args;
      return volkernRequest(`/leads/${leadId}/interactions`, "POST", interactionData);
    }

    // NOTES
    case "volkern_list_notes":
      return volkernRequest(`/leads/${args.leadId}/notes`);
    case "volkern_create_note": {
      const { leadId: noteLeadId, ...noteData } = args;
      return volkernRequest(`/leads/${noteLeadId}/notes`, "POST", noteData);
    }

    // DEALS
    case "volkern_list_deals": {
      const params = new URLSearchParams();
      if (args.etapa) params.append("etapa", String(args.etapa));
      if (args.prioridad) params.append("prioridad", String(args.prioridad));
      if (args.leadId) params.append("leadId", String(args.leadId));
      if (args.contactId) params.append("contactId", String(args.contactId));
      if (args.search) params.append("search", String(args.search));
      if (args.page) params.append("page", String(args.page));
      if (args.limit) params.append("limit", String(args.limit));
      return volkernRequest(`/deals?${params.toString()}`);
    }
    case "volkern_create_deal":
      return volkernRequest("/deals", "POST", args);

    // COTIZACIONES
    case "volkern_create_cotizacion":
      return volkernRequest("/cotizaciones/from-catalog", "POST", args);

    // ÓRDENES DE VENTA
    case "volkern_list_ordenes_venta": {
      const params = new URLSearchParams();
      if (args.estado) params.append("estado", String(args.estado));
      if (args.leadId) params.append("leadId", String(args.leadId));
      if (args.contactId) params.append("contactId", String(args.contactId));
      if (args.dealId) params.append("dealId", String(args.dealId));
      if (args.contratoId) params.append("contratoId", String(args.contratoId));
      if (args.fechaDesde) params.append("fechaDesde", String(args.fechaDesde));
      if (args.fechaHasta) params.append("fechaHasta", String(args.fechaHasta));
      if (args.search) params.append("search", String(args.search));
      if (args.page) params.append("page", String(args.page));
      if (args.limit) params.append("limit", String(args.limit));
      return volkernRequest(`/ordenes-venta?${params.toString()}`);
    }
    case "volkern_get_orden_venta":
      return volkernRequest(`/ordenes-venta/${args.ordenId}`);
    case "volkern_create_orden_from_cotizacion":
      return volkernRequest("/ordenes-venta/from-cotizacion", "POST", args);

    // CONTRATOS
    case "volkern_create_contrato_from_cotizacion":
      return volkernRequest("/contratos/from-cotizacion", "POST", args);

    // FINANCE (ERP)
    case "volkern_get_financial_dashboard": {
      const params = new URLSearchParams();
      if (args.months) params.append("months", String(args.months));
      return volkernRequest(`/erp/finance/consolidation?${params.toString()}`);
    }
    case "volkern_verify_vault_integrity":
      return volkernRequest("/erp/finance/integrity");
    case "volkern_calculate_tax_provisions": {
      const params = new URLSearchParams();
      params.append("country", String(args.country));
      return volkernRequest(`/erp/finance/taxes?${params.toString()}`);
    }

    // INVENTORY (MRP)
    case "volkern_process_inventory_consumption":
      return volkernRequest("/erp/inventory/consumption", "POST", args);
    case "volkern_get_inventory_health": {
      const params = new URLSearchParams();
      if (args.itemId) params.append("catalogoItemId", String(args.itemId));
      return volkernRequest(`/erp/inventory?${params.toString()}`);
    }

    // PRODUCTION
    case "volkern_report_production_scrap":
      return volkernRequest("/erp/production/scrap", "POST", args);

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// ============================================
// Server Setup (SDK v2 — spec MCP 2026-07-28)
// ============================================

/**
 * Crea una instancia del servidor MCP con las 43 tools registradas.
 * Se crea una instancia nueva por conexión/petición (patrón stateless).
 */
function createVolkernServer(): McpServer {
  const server = new McpServer(
    { name: "volkern-mcp-server", version: VERSION },
    { capabilities: { tools: {} } }
  );

  for (const tool of VOLKERN_TOOLS) {
    server.registerTool(
      tool.name,
      {
        description: tool.description,
        inputSchema: fromJsonSchema(tool.inputSchema as unknown as JsonSchemaType),
      },
      async (args: unknown) => {
        const toolArgs = (args ?? {}) as Record<string, unknown>;
        try {
          const result = await handleToolCall(tool.name, toolArgs);
          return {
            content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
          };
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          return {
            content: [{ type: "text" as const, text: `Error: ${errorMessage}` }],
            isError: true,
          };
        }
      }
    );
  }

  return server;
}

// ============================================
// HTTP Transport — Streamable HTTP stateless (spec 2026-07-28)
// ============================================

async function toWebRequest(req: IncomingMessage): Promise<Request> {
  const host = req.headers.host || `localhost:${PORT}`;
  const url = `http://${host}${req.url || "/"}`;
  const method = (req.method || "GET").toUpperCase();

  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) value.forEach((v) => headers.append(key, v));
    else headers.set(key, value);
  }

  const hasBody = ["POST", "PUT", "PATCH", "DELETE"].includes(method);
  let body: BodyInit | undefined;
  if (hasBody) {
    const raw = await new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      req.on("data", (chunk) => chunks.push(chunk));
      req.on("end", () => resolve(Buffer.concat(chunks)));
      req.on("error", reject);
    });
    body = new Uint8Array(raw);
  }

  return new Request(url, { method, headers, body });
}

async function writeWebResponse(response: Response, res: ServerResponse): Promise<void> {
  const headers: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    headers[key] = value;
  });
  res.writeHead(response.status, headers);

  if (response.body) {
    const nodeStream = Readable.fromWeb(response.body as unknown as WebReadableStream);
    nodeStream.pipe(res);
    await new Promise<void>((resolve, reject) => {
      nodeStream.on("end", resolve);
      nodeStream.on("error", reject);
      res.on("close", resolve);
    });
  } else {
    res.end();
  }
}

async function startHttpServer(): Promise<void> {
  const httpServer = createServer(
    async (req: IncomingMessage, res: ServerResponse) => {
      const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
      const pathname = url.pathname;

      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
      res.setHeader(
        "Access-Control-Allow-Headers",
        "Content-Type, Authorization, X-API-Key, Mcp-Session-Id, Mcp-Protocol-Version"
      );

      if (req.method === "OPTIONS") {
        res.writeHead(204);
        res.end();
        return;
      }

      if (pathname === "/health") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            status: "ok",
            server: "volkern-mcp-server",
            version: VERSION,
            transport: "http",
          })
        );
        return;
      }

      // Endpoint MCP Streamable HTTP (stateless: servidor y transporte nuevos
      // por petición; GET/DELETE de sesiones 2025 responden 405 por diseño).
      if (pathname === "/mcp" || pathname === "/") {
        try {
          const transport = new WebStandardStreamableHTTPServerTransport({
            enableJsonResponse: true,
          });
          const server = createVolkernServer();
          await server.connect(transport);
          const response = await transport.handleRequest(await toWebRequest(req));
          await writeWebResponse(response, res);
        } catch (error) {
          console.error("Error handling MCP request:", error);
          if (!res.headersSent) {
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(
              JSON.stringify({
                jsonrpc: "2.0",
                error: { code: -32603, message: "Internal server error" },
                id: null,
              })
            );
          }
        }
        return;
      }

      res.writeHead(404);
      res.end("Not Found");
    }
  );

  // Graceful shutdown
  process.on("SIGINT", () => {
    console.error("\nShutting down HTTP server...");
    httpServer.close();
    process.exit(0);
  });
  process.on("SIGTERM", () => {
    console.error("Shutting down HTTP server...");
    httpServer.close();
    process.exit(0);
  });

  return new Promise<void>((resolve, reject) => {
    httpServer.listen(PORT, () => {
      console.error(
        `Volkern MCP Server (SDK v2, spec 2026-07-28) on Streamable HTTP at http://localhost:${PORT}/mcp`
      );
      resolve();
    });
    httpServer.on("error", reject);
  });
}

// ============================================
// Start server (stdio or HTTP)
// ============================================
async function main() {
  if (TRANSPORT === "http" || TRANSPORT === "sse") {
    if (TRANSPORT === "sse") {
      console.error(
        "TRANSPORT=sse está obsoleto desde la spec 2026-07-28; iniciando Streamable HTTP en /mcp"
      );
    }
    await startHttpServer();
  } else {
    const server = createVolkernServer();
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("Volkern MCP Server running on stdio (SDK v2, spec MCP 2026-07-28)");
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
