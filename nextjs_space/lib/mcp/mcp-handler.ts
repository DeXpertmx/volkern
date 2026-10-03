/**
 * Volkern MCP Handler
 * Model Context Protocol Server Implementation
 * 
 * Expone los Skills de Volkern como MCP Tools
 * Compatible con Claude, ChatGPT y otros LLMs que soporten MCP
 * 
 * Arquitectura:
 * LLM/Agent → MCP Server → Skills → Core → EventBus
 *
 * UNA SOLA FUENTE DE VERDAD: el catálogo compartido
 * (mcp-server/src/tools-catalog.ts) define TODOS los contratos volkern_*
 * (nombres, descripciones e inputSchemas). handleListTools y la card se
 * derivan de él y handleCallTool valida SIEMPRE contra su schema, también
 * para las llamadas legacy sin prefijo del orquestador (/api/mcp). El
 * registro paralelo de ~69 tools legacy que vivía aquí fue eliminado: cada
 * schema duplicado era un contrato que podía derivar en silencio.
 */

import { prisma } from '@/lib/db';
import { skills, executeSkill, listSkills, SkillName } from '@/lib/skills';
// Catálogo compartido con el standalone: única fuente de verdad de los
// contratos volkern_* (nombres, descripciones e inputSchemas reales).
import { VOLKERN_TOOLS, type VolkernTool } from '../../mcp-server/src/tools-catalog';

// ============== TIPOS MCP ==============

/** Tool MCP: forma idéntica a la del catálogo compartido (fuente única). */
export type MCPTool = VolkernTool;

// ═══════════════════════════════════════════════════════════════
// RESOLUCIÓN CATÁLOGO → SKILL
// El catálogo (mcp-server/src/tools-catalog.ts) es la única fuente de
// verdad de los contratos publicados por MCP (vía /mcp, /api/mcp y la
// Server Card). Ningún consumidor importa listas paralelas: lo impide el
// test de no-derivación de mcp-server-card.test.ts.
// ═══════════════════════════════════════════════════════════════

// Aliases: la tool del catálogo y el skill difieren en nombre
const CATALOG_EXEC_ALIASES: Record<string, string> = {
  volkern_get_catalogo_item: 'get_catalog_item',
  volkern_search_catalogo: 'search_catalog',
}

/** volkern_X → nombre de skill ejecutable en el mapa `skills` */
export function resolveSkillName(toolName: string): string {
  return CATALOG_EXEC_ALIASES[toolName] ?? toolName.replace(/^volkern_/, '')
}

/** inputSchema del catálogo para un nombre de skill (undefined si no es del catálogo) */
export function resolveCatalogToolSchema(skillName: string) {
  return VOLKERN_TOOLS.find(t => resolveSkillName(t.name) === skillName)?.inputSchema
}

export interface MCPListToolsResponse {
  tools: MCPTool[];
}

export interface MCPCallToolRequest {
  name: string;
  arguments: Record<string, unknown>;
}

export interface MCPCallToolResponse {
  content: Array<{
    type: 'text' | 'image' | 'resource';
    text?: string;
    data?: string;
    mimeType?: string;
  }>;
  isError?: boolean;
}

// ============== HANDLERS MCP ==============

/**
 * Lista todas las herramientas disponibles
 */
export function handleListTools(): MCPListToolsResponse {
  // Vista derivada del catálogo compartido (única fuente de verdad): nunca
  // una lista paralela. Se mapea a objetos nuevos para que ningún consumer
  // mute el catálogo por accidente.
  return {
    tools: VOLKERN_TOOLS.map(({ name, description, inputSchema }) => ({
      name,
      description,
      inputSchema,
    })),
  };
}

/**
 * Ejecuta una herramienta
 */
export async function handleCallTool(request: MCPCallToolRequest): Promise<MCPCallToolResponse> {
  const { name, arguments: args } = request;

  // Verificar que el tool existe: primero el catálogo standalone (contrato
  // volkern_* que ven los agentes), luego el registro legacy del orquestador.
  // Una sola fuente de verdad: la tool (con o sin prefijo volkern_) debe
  // existir en el catálogo. Las llamadas legacy del orquestador sin prefijo
  // ('create_lead') resuelven a su tool del catálogo por alias/prefijo y se
  // validan contra el MISMO schema que publica tools/list.
  const catalogTool = VOLKERN_TOOLS.find(t => t.name === name)
    ?? VOLKERN_TOOLS.find(t => resolveSkillName(t.name) === name);
  if (!catalogTool) {
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({ error: `Tool "${name}" no encontrado` }),
      }],
      isError: true,
    };
  }

  // Validar argumentos requeridos contra el schema del catálogo
  const missingArgs = catalogTool.inputSchema.required?.filter(
    arg => args[arg] === undefined || args[arg] === null
  ) || [];

  if (missingArgs.length > 0) {
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({ 
          error: `Argumentos requeridos faltantes: ${missingArgs.join(', ')}` 
        }),
      }],
      isError: true,
    };
  }

  try {
    // 1. Resolver el contexto del usuario para validación de roles de confianza
    const user = await prisma.user.findUnique({
      where: { id: args.userId as string },
      include: { role: true }
    });

    // Validación de Rol OWNER para acciones sensibles (por nombre de skill,
    // así vale tanto para la tool del catálogo como para su alias legacy)
    const sensitiveTools = ['authorize_bulk_expenses', 'orchestrate_secure_payroll'];
    const bareSkillName = resolveSkillName(catalogTool.name);
    if (sensitiveTools.includes(bareSkillName) && user?.role?.nombre !== 'OWNER') {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ 
            error: 'Soberanía Denegada: Esta acción requiere privilegios de OWNER.',
            requiredRole: 'OWNER',
            currentRole: user?.role?.nombre || 'UNKNOWN'
          }),
        }],
        isError: true,
      };
    }

    const ctx = {
      tenantId: args.tenantId as string,
      user: user ? {
        id: user.id,
        email: user.email,
        role: user.role?.nombre
      } : undefined
    };

    // Marcar source como 'mcp' si no está definido
    const enrichedArgs = {
      ...args,
      ctx, // Pasamos el contexto de seguridad
      source: (args.source || 'mcp') as 'api' | 'app' | 'automation' | 'mcp' | 'webhook',
    };

    // Ejecutar el skill correspondiente (resuelto desde la tool del catálogo)
    const skillName = resolveSkillName(catalogTool.name);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await executeSkill(skillName as SkillName, enrichedArgs as any);

    return {
      content: [{
        type: 'text',
        text: JSON.stringify(result, null, 2),
      }],
      isError: false,
    };
  } catch (error) {
    console.error(`[MCP] Error ejecutando tool ${name}:`, error);
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({ 
          error: error instanceof Error ? error.message : 'Error desconocido',
          tool: name,
        }),
      }],
      isError: true,
    };
  }
}

// ============== SERVER INFO ==============

export const MCP_SERVER_INFO = {
  name: 'volkern-crm',
  version: '2.0.0',
  description: 'Volkern CRM MCP Server - Expone skills del CRM como herramientas para LLMs',
  capabilities: {
    tools: {
      listTools: true,
      callTool: true,
    },
  },
};

/**
 * Obtiene información del servidor
 */
export function handleServerInfo() {
  return MCP_SERVER_INFO;
}
