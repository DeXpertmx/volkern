/**
 * Registro único de herramientas del agente.
 *
 * No hay un catálogo nuevo: este módulo **compone** las tres fuentes que ya
 * existen, para que el agente tenga una sola lista de la que leer y un solo
 * punto donde se decide qué puede hacer.
 *
 * - `crm`: las herramientas propias del agente (`herramientas-crm.ts`).
 * - `mcp`: herramientas del catálogo MCP (`mcp-server/src/tools-catalog.ts`),
 *   ejecutadas por el mismo handler que usa /mcp.
 * - `skill`: skills del registro (`lib/skills`) que todavía no tienen contrato
 *   MCP propio y que el chat necesita (tareas pendientes y pipeline). Lo que
 *   ya tiene tool en el catálogo (citas, por ejemplo) no se duplica aquí.
 *
 * Exposición **por valor**: sólo entra al modelo un subconjunto curado, no las
 * 43 tools ni las 191 skills. El resto sigue disponible por MCP para clientes
 * externos; meterlo en el prompt sólo gasta contexto y amplía la superficie.
 *
 * Autorización: se decide aquí, en backend, con el mismo RBAC del resto de la
 * app (`hasPermisoDeRol`) **y** con las restricciones que la empresa haya
 * guardado en `mcp_tool_capabilities`: el rol abre el módulo, y el override
 * puede cerrarlo igual que en la puerta MCP. El modelo nunca ve ni decide
 * permisos, y tampoco recibe `tenantId`/`userId`: se inyectan desde la sesión
 * al ejecutar. La ejecución exige la autorización del turno: no hay una puerta
 * sin permiso que un llamador pueda olvidar cerrar.
 */

import { prisma } from '@/lib/db';
import { VOLKERN_TOOLS } from '../../mcp-server/src/tools-catalog';
import { decideToolCall, type CapabilityOverride } from '@/lib/mcp/tool-policy';
import type { OpenRouterTool } from '@/lib/assistant/openrouter-client';
import { HERRAMIENTAS, ejecutarHerramientaCrm } from './herramientas-crm';
import {
  evaluarPermisoHerramienta,
  PERMISOS_HERRAMIENTAS,
  type PoliticaHerramienta,
  type PoliticasHerramientas,
  type ResultadoPermiso,
  type RolDeUsuario,
} from './crm-tool-permissions';

export type OrigenHerramienta = 'crm' | 'mcp' | 'skill';

export interface DefinicionHerramienta {
  nombre: string;
  origen: OrigenHerramienta;
  descripcion: string;
  parametros: Record<string, any>;
}

/** Permiso ya resuelto del turno: rol del usuario y overrides de la empresa. */
export interface AutorizacionHerramientas {
  usuario: RolDeUsuario;
  restricciones?: RestriccionesMcp;
}

export interface ContextoEjecucion {
  tenantId: string;
  userId: string;
  /** Sin autorización no se ejecuta ninguna herramienta. */
  autorizacion: AutorizacionHerramientas;
}

/** Overrides de la empresa (`mcp_tool_capabilities`) agrupados por herramienta. */
export type RestriccionesMcp = Record<string, CapabilityOverride[]>;

/**
 * Herramientas del catálogo MCP que sí entran al chat, por orden de valor:
 * pipeline, cartera, agenda y resumen financiero. Todas son de lectura: las
 * de escritura del catálogo piden aprobación y eso llega con su flujo, no con
 * el registro.
 *
 * El módulo es el del CRM al que pertenece el dato, no el del catálogo MCP:
 * `leads.ver` abre el pipeline de negocio, `catalogo.ver` la cartera.
 */
const MCP_EXPUESTAS: Record<string, PoliticaHerramienta> = {
  volkern_list_deals: { modulo: 'leads', accion: 'ver' },
  volkern_list_catalogo: { modulo: 'catalogo', accion: 'ver' },
  volkern_list_citas: { modulo: 'citas', accion: 'ver' },
  volkern_get_financial_dashboard: { modulo: 'analytics', accion: 'ver' },
};

export const HERRAMIENTAS_MCP_EXPUESTAS = Object.keys(MCP_EXPUESTAS);

/**
 * Skills que el catálogo MCP no cubre y el chat sí necesita.
 *
 * Se declaran aquí —nombre, esquema y permiso— porque su contrato no viaja por
 * MCP; el schema es la descripción mínima para que el modelo sepa invocarlas,
 * y la ejecución va por `executeSkill`, no por una implementación paralela.
 */
const HERRAMIENTAS_SKILL: Array<DefinicionHerramienta & { politica: PoliticaHerramienta }> = [
  {
    nombre: 'get_pending_tasks',
    origen: 'skill',
    descripcion:
      'Lista las tareas pendientes del usuario ordenadas por vencimiento. Úsala para «qué tengo pendiente», «mis tareas» o «las tareas de Ana» (con nombre o correo).',
    parametros: {
      type: 'object',
      properties: {
        nombre: { type: 'string', description: 'Nombre de la persona, si se quieren sólo sus tareas' },
        email: { type: 'string', description: 'Correo de la persona, si se conoce' },
      },
      additionalProperties: false,
    },
    // Las tareas cuelgan del lead: el mismo módulo que la ficha.
    politica: { modulo: 'leads', accion: 'ver' },
  },
  {
    nombre: 'update_deal',
    origen: 'skill',
    descripcion:
      'Actualiza el negocio abierto de una persona: etapa del pipeline, monto, prioridad o título. Identifícala por nombre o correo, no por id.',
    parametros: {
      type: 'object',
      properties: {
        nombre: { type: 'string', description: 'Nombre de la persona' },
        email: { type: 'string', description: 'Correo de la persona' },
        etapa: { type: 'string', description: 'Nueva etapa (calificacion, propuesta, negociacion, ganado, perdido)' },
        monto: { type: 'number', description: 'Nuevo importe del negocio' },
        prioridad: { type: 'string', enum: ['baja', 'media', 'alta', 'urgente'] },
        titulo: { type: 'string', description: 'Nuevo título del negocio' },
      },
      additionalProperties: false,
    },
    politica: { modulo: 'leads', accion: 'editar' },
  },
];

/** Política de cada herramienta del registro; sin fila, no se ejecuta. */
export const POLITICAS_REGISTRO: PoliticasHerramientas = {
  ...PERMISOS_HERRAMIENTAS,
  ...MCP_EXPUESTAS,
  ...Object.fromEntries(HERRAMIENTAS_SKILL.map((h) => [h.nombre, h.politica])),
};

/** Las herramientas MCP expuestas, derivadas del catálogo (nunca una copia). */
function definicionesMcp(): DefinicionHerramienta[] {
  return HERRAMIENTAS_MCP_EXPUESTAS.map((nombre) => {
    const tool = VOLKERN_TOOLS.find((t) => t.name === nombre);
    if (!tool) {
      // Falla al cargar, no al llamar: una tool borrada del catálogo debe
      // romper el build, no dejar al agente ofreciendo algo que no existe.
      throw new Error(`La herramienta MCP "${nombre}" no está en el catálogo`);
    }
    return {
      nombre,
      origen: 'mcp' as const,
      descripcion: tool.description,
      parametros: tool.inputSchema as Record<string, any>,
    };
  });
}

const DEFINICIONES: readonly DefinicionHerramienta[] = [
  ...HERRAMIENTAS.map((herramienta) => ({
    nombre: herramienta.function.name,
    origen: 'crm' as const,
    descripcion: herramienta.function.description,
    parametros: herramienta.function.parameters,
  })),
  ...definicionesMcp(),
  ...HERRAMIENTAS_SKILL,
];

/** Todas las herramientas del registro, con su origen. */
export function herramientasDelRegistro(): readonly DefinicionHerramienta[] {
  return DEFINICIONES;
}

export function definicionDe(nombre: string): DefinicionHerramienta | undefined {
  return DEFINICIONES.find((h) => h.nombre === nombre);
}

/**
 * Restricciones guardadas por la empresa para las tools MCP del registro.
 *
 * Se leen una vez por turno y se agrupan por herramienta: `decideToolCall`
 * espera los overrides de una sola tool, no la tabla entera. La consulta va
 * con `tenantId`, así que una restricción de otra empresa no aplica aquí.
 */
export async function cargarRestriccionesMcp(
  tenantId: string,
  nombres: readonly string[] = HERRAMIENTAS_MCP_EXPUESTAS
): Promise<RestriccionesMcp> {
  if (nombres.length === 0) return {};

  const filas = await prisma.mcpToolCapability.findMany({
    where: { tenantId, toolName: { in: [...nombres] } },
    select: { toolName: true, roleName: true, decision: true },
  });

  const porHerramienta: RestriccionesMcp = {};
  for (const fila of filas) {
    (porHerramienta[fila.toolName] ??= []).push({
      roleName: fila.roleName ?? null,
      decision: fila.decision,
    });
  }
  return porHerramienta;
}

/**
 * ¿Puede este rol ejecutar esta herramienta?
 *
 * Dos puertas, en este orden: el RBAC del módulo y —sólo para las tools del
 * catálogo MCP— la decisión del gate con los overrides de la empresa. La
 * segunda no sustituye a la primera: una empresa puede restringir de más,
 * nunca conceder lo que el rol no tiene.
 */
export function autorizarHerramienta(
  nombre: string,
  autorizacion: RolDeUsuario,
  restricciones: RestriccionesMcp = {}
): ResultadoPermiso {
  const permiso = evaluarPermisoHerramienta(nombre, autorizacion, POLITICAS_REGISTRO);
  if (!permiso.permitido) return permiso;

  const definicion = definicionDe(nombre);
  if (definicion?.origen !== 'mcp') return permiso;

  const decision = decideToolCall({
    toolName: nombre,
    roleName: autorizacion.role?.nombre,
    overrides: restricciones[nombre] ?? [],
  });

  // En el chat no hay bandeja de aprobación: `ask` se trata como no disponible
  // (ni se ofrece al modelo ni se ejecuta) en vez de ejecutarse a ciegas.
  if (decision.decision !== 'allow') {
    return {
      permitido: false,
      motivo: `la configuración de la empresa no permite ${nombre}: ${decision.reason}`,
    };
  }

  return permiso;
}

/**
 * Herramientas que se envían al modelo: sólo las que este rol podría ejecutar.
 *
 * No es una comodidad, es parte de la autorización: si el modelo no ve la
 * herramienta, no la propone; y si la propone igualmente (mensaje antiguo,
 * reintento), la comprobación de ejecución la deniega.
 */
export function herramientasParaElModelo(
  autorizacion: RolDeUsuario,
  restricciones: RestriccionesMcp = {}
): OpenRouterTool[] {
  return DEFINICIONES.filter(
    (h) => autorizarHerramienta(h.nombre, autorizacion, restricciones).permitido
  ).map(
    (h) => ({
      type: 'function' as const,
      function: {
        name: h.nombre,
        description: h.descripcion,
        parameters: h.parametros,
      },
    })
  );
}

/** La ejecución se negó: el agente lo traduce a `sin_permiso` para el modelo. */
export class PermisoDenegadoError extends Error {
  readonly codigo = 'sin_permiso';

  constructor(readonly motivo: string) {
    super(motivo);
    this.name = 'PermisoDenegadoError';
  }
}

/** Ejecuta una herramienta del registro con la identidad de la sesión. */
export async function ejecutarHerramientaDelAgente(
  nombre: string,
  args: Record<string, any>,
  ctx: ContextoEjecucion
): Promise<any> {
  const definicion = definicionDe(nombre);
  if (!definicion) throw new PermisoDenegadoError(`herramienta desconocida: ${nombre}`);

  // La autorización se comprueba aquí, en el único punto por el que se puede
  // llegar a una skill: así no existe una llamada que se salte el permiso.
  const permiso = autorizarHerramienta(
    nombre,
    ctx.autorizacion.usuario,
    ctx.autorizacion.restricciones
  );
  if (!permiso.permitido) {
    throw new PermisoDenegadoError(permiso.motivo ?? `sin permiso para ${nombre}`);
  }

  if (definicion.origen === 'crm') {
    return ejecutarHerramientaCrm(nombre, args, ctx);
  }

  if (definicion.origen === 'mcp') {
    // Mismo camino que /mcp: resuelve la tool del catálogo y ejecuta su skill.
    const { handleCallTool } = await import('@/lib/mcp/mcp-handler');
    const respuesta = await handleCallTool({
      name: nombre,
      // La identidad va al final: el modelo no puede sobrescribirla.
      arguments: { ...args, tenantId: ctx.tenantId, userId: ctx.userId, source: 'app' },
    });
    const texto = respuesta.content?.[0]?.text ?? '';
    if (respuesta.isError) {
      throw new Error(texto || `La herramienta ${nombre} devolvió un error`);
    }
    try {
      return JSON.parse(texto);
    } catch {
      return { texto };
    }
  }

  const { executeSkill } = await import('@/lib/skills');
  return executeSkill(
    nombre as any,
    { ...args, tenantId: ctx.tenantId, userId: ctx.userId, source: 'app' } as any
  );
}
