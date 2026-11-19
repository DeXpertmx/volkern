/**
 * P3 — Registro único de herramientas del agente.
 *
 * Comprueba tres cosas que no se ven mirando el prompt:
 *   1. El registro se deriva de las fuentes existentes (catálogo MCP + skills +
 *      nativas) y ninguna herramienta queda sin política.
 *   2. El modelo sólo ve las herramientas que su rol podría ejecutar.
 *   3. La ejecución vuelve a autorizar y la identidad la pone el backend, no el
 *      modelo: un `tenantId` en los argumentos se sobrescribe.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { reiniciarPrisma } from '../ayuda/prisma-en-memoria';

const h = vi.hoisted(() => ({
  llamadasMcp: [] as Array<{ name: string; arguments: Record<string, any> }>,
  llamadasSkill: [] as Array<{ nombre: string; payload: Record<string, any> }>,
  herramientasAlModelo: [] as string[][],
  guion: [] as Array<{ nombre: string; args: Record<string, any> }>,
  respuestas: [] as string[],
}));

vi.mock('@/lib/db', async () => {
  const { prismaActual } = await import('../ayuda/prisma-en-memoria');
  const delegado = new Proxy({}, { get: (_t, prop: string) => (prismaActual.prisma as any)[prop] });
  return { prisma: delegado, globalPrisma: delegado, getTenantDb: async () => delegado };
});

// El catálogo MCP se comprueba en su propia suite: aquí interesa qué nombre y
// qué identidad recibe el handler, no ejecutar la tool.
vi.mock('@/lib/mcp/mcp-handler', () => ({
  handleCallTool: async (peticion: { name: string; arguments: Record<string, any> }) => {
    h.llamadasMcp.push(peticion);
    return {
      content: [{ type: 'text', text: JSON.stringify({ items: [{ id: 'cat-a' }] }) }],
      isError: false,
    };
  },
}));

vi.mock('@/lib/skills', () => ({
  executeSkill: async (nombre: string, payload: Record<string, any>) => {
    h.llamadasSkill.push({ nombre, payload });
    return { tareas: [] };
  },
}));

vi.mock('@/lib/assistant/openrouter-client', () => ({
  callAssistantWithToolLoop: async (
    _mensajes: unknown,
    herramientas: Array<{ function: { name: string } }>,
    ejecutar: (nombre: string, args: Record<string, any>) => Promise<string>
  ) => {
    h.herramientasAlModelo.push(herramientas.map((t) => t.function.name));
    for (const paso of h.guion) h.respuestas.push(await ejecutar(paso.nombre, paso.args));
    return { choices: [{ message: { content: 'Resumen' } }] };
  },
}));

import { VOLKERN_TOOLS } from '../../mcp-server/src/tools-catalog';
import { TOOL_POLICIES } from '@/lib/mcp/tool-policy';
import { ALL_PERMISSION_MODULES } from '@/lib/permissions-core';
import {
  POLITICAS_REGISTRO,
  HERRAMIENTAS_MCP_EXPUESTAS,
  autorizarHerramienta,
  cargarRestriccionesMcp,
  ejecutarHerramientaDelAgente,
  herramientasDelRegistro,
  herramientasParaElModelo,
  PermisoDenegadoError,
} from '@/lib/agents/tool-registry';

const TENANT = 'tenant-a';

const ROL_COMERCIAL = { id: 'r-comercial', nombre: 'Comercial', permisos: { leads: { ver: true, editar: true } } };
const ROL_SOLO_LECTURA = { id: 'r-lectura', nombre: 'Solo lectura', permisos: { leads: { ver: true } } };
const ROL_CATALOGO = { id: 'r-catalogo', nombre: 'Catálogo', permisos: { catalogo: { ver: true } } };
const ROL_AGENDA = { id: 'r-agenda', nombre: 'Agenda', permisos: { citas: { ver: true, crear: true, cancelar: true } } };
const ROL_ADMINISTRACION = { id: 'r-admin', nombre: 'Administración', permisos: { catalogo: { ver: true } } };
const ROL_SIN_PERMISOS = { id: 'r-vacio', nombre: 'Vacío', permisos: {} };

function rol(role: typeof ROL_COMERCIAL | typeof ROL_SIN_PERMISOS, existe = true) {
  return { role, existe };
}

function sembrar(extra: Record<string, any[]> = {}) {
  reiniciarPrisma({
    tenant: [{ id: TENANT, nombre: 'Inmobiliaria A' }],
    user: [
      { id: 'u-comercial', tenantId: TENANT, name: 'Carla', role: ROL_COMERCIAL },
      { id: 'u-lectura', tenantId: TENANT, name: 'Lola', role: ROL_SOLO_LECTURA },
      { id: 'u-catalogo', tenantId: TENANT, name: 'Catálogo', role: ROL_CATALOGO },
      { id: 'u-agenda', tenantId: TENANT, name: 'Agenda', role: ROL_AGENDA },
      { id: 'u-administracion', tenantId: TENANT, name: 'Admin', role: ROL_ADMINISTRACION },
      { id: 'u-vacio', tenantId: TENANT, name: 'Sin permisos', role: ROL_SIN_PERMISOS },
      { id: 'u-sin-rol', tenantId: TENANT, name: 'Sin rol', role: null },
    ],
    mcpToolCapability: [],
    ...extra,
  });
}

async function pedir(userId: string, pasos: Array<{ nombre: string; args: Record<string, any> }>) {
  h.guion.length = 0;
  h.guion.push(...pasos);
  const { ejecutarAgenteCrm } = await import('@/lib/agents/crm-tool-agent');
  return ejecutarAgenteCrm({ message: 'prueba del registro', tenantId: TENANT, userId });
}

beforeEach(() => {
  sembrar();
  h.llamadasMcp.length = 0;
  h.llamadasSkill.length = 0;
  h.herramientasAlModelo.length = 0;
  h.guion.length = 0;
  h.respuestas.length = 0;
});

describe('registro único', () => {
  it('compone nativas, catálogo MCP y skills sin duplicar nombres', () => {
    const nombres = herramientasDelRegistro().map((h) => h.nombre);

    expect(new Set(nombres).size).toBe(nombres.length);

    // Las nativas siguen estando, las MCP se leen del catálogo (no hay copia
    // local de sus contratos) y las skills cubren lo que el catálogo no tiene.
    expect(nombres).toContain('buscar_persona');
    for (const nombre of HERRAMIENTAS_MCP_EXPUESTAS) {
      expect(nombres).toContain(nombre);
    }
    expect(nombres).toEqual(expect.arrayContaining(['get_pending_tasks', 'update_deal']));
    // Lo que ya tiene tool en el catálogo no se duplica como skill.
    expect(nombres).not.toContain('create_booking');
    expect(nombres).not.toContain('cancel_booking');
    // 8 nativas + 4 del catálogo + 2 skills: la exposición es por valor, no
    // las 43 tools completas.
    expect(nombres).toHaveLength(14);
  });

  it('toda herramienta tiene política con un módulo que existe', () => {
    for (const definicion of herramientasDelRegistro()) {
      const politica = POLITICAS_REGISTRO[definicion.nombre];
      expect(politica, `${definicion.nombre} sin política`).toBeDefined();
      expect(ALL_PERMISSION_MODULES).toContain(politica.modulo);
      expect(definicion.parametros.type).toBe('object');
    }
  });

  it('ninguna herramienta es ejecutable sin rol: el registro deniega por defecto', () => {
    for (const definicion of herramientasDelRegistro()) {
      const permiso = autorizarHerramienta(definicion.nombre, { role: null, existe: true });
      expect(permiso.permitido, `${definicion.nombre} se autoriza sin rol`).toBe(false);
    }
  });

  it('las herramientas MCP expuestas salen del catálogo y no son irreversibles', () => {
    for (const nombre of HERRAMIENTAS_MCP_EXPUESTAS) {
      expect(VOLKERN_TOOLS.some((t) => t.name === nombre)).toBe(true);
      const politica = TOOL_POLICIES[nombre];
      expect(politica, `${nombre} sin clasificar en el gate`).toBeDefined();
      // El chat sólo expone lecturas del catálogo: enviar, borrar o generar
      // documentos irreversibles no entra sin su flujo de aprobación.
      expect(politica.risk).toBe('read');
    }
  });
});

describe('exposición por rol', () => {
  it('un comercial no ve la cartera ni las finanzas, sí su pipeline y tareas', () => {
    const visibles = herramientasParaElModelo(rol(ROL_COMERCIAL)).map((t) => t.function.name);

    expect(visibles).toContain('buscar_persona');
    expect(visibles).toContain('crear_nota');
    expect(visibles).toContain('volkern_list_deals');
    expect(visibles).toContain('get_pending_tasks');
    expect(visibles).toContain('update_deal');

    expect(visibles).not.toContain('buscar_propiedades');
    expect(visibles).not.toContain('volkern_list_catalogo');
    expect(visibles).not.toContain('volkern_get_financial_dashboard');
  });

  it('quien sólo tiene catálogo ve inmuebles y no el pipeline', () => {
    const visibles = herramientasParaElModelo(rol(ROL_CATALOGO)).map((t) => t.function.name);

    expect(visibles).toContain('buscar_propiedades');
    expect(visibles).toContain('volkern_list_catalogo');
    expect(visibles).not.toContain('volkern_list_deals');
    expect(visibles).not.toContain('crear_nota');
  });

  it('agenda abre las citas y no lo demás', () => {
    const visibles = herramientasParaElModelo(rol(ROL_AGENDA)).map((t) => t.function.name);

    // Las citas se leen por el catálogo; agendar o cancelar no se duplica en
    // el chat mientras el flujo de aprobación no exista.
    expect(visibles).toContain('volkern_list_citas');
    expect(visibles).not.toContain('create_booking');
    expect(visibles).not.toContain('cancel_booking');
    expect(visibles).not.toContain('update_deal');
  });

  it('leer no implica editar: el pipeline se ve pero no se actualiza', () => {
    const visibles = herramientasParaElModelo(rol(ROL_SOLO_LECTURA)).map((t) => t.function.name);

    expect(visibles).toContain('get_pending_tasks');
    expect(visibles).not.toContain('update_deal');
  });

  it('sin rol no se expone ninguna herramienta (denegar por defecto)', () => {
    expect(herramientasParaElModelo(rol(ROL_SIN_PERMISOS))).toEqual([]);
    expect(herramientasParaElModelo({ role: null, existe: true })).toEqual([]);
    expect(autorizarHerramienta('buscar_persona', rol(ROL_SIN_PERMISOS)).permitido).toBe(false);
  });
});

describe('ejecución con identidad de la sesión', () => {
  it('una tool MCP recibe el tenant y el usuario de la sesión, no los del modelo', async () => {
    const resultado = await pedir('u-catalogo', [
      {
        nombre: 'volkern_list_catalogo',
        // El modelo intenta colar otro tenant/usuario en los argumentos.
        args: { tipo: 'servicio', tenantId: 'tenant-b', userId: 'intruso' },
      },
    ]);

    expect(resultado.herramientas).toEqual(['volkern_list_catalogo']);
    expect(h.llamadasMcp).toHaveLength(1);
    expect(h.llamadasMcp[0].arguments).toMatchObject({
      tenantId: TENANT,
      userId: 'u-catalogo',
      source: 'app',
      tipo: 'servicio',
    });
  });

  it('una skill recibe también la identidad de la sesión', async () => {
    const resultado = await pedir('u-comercial', [
      { nombre: 'get_pending_tasks', args: { tenantId: 'tenant-b', userId: 'intruso' } },
    ]);

    expect(resultado.herramientas).toEqual(['get_pending_tasks']);
    expect(h.llamadasSkill).toHaveLength(1);
    expect(h.llamadasSkill[0].nombre).toBe('get_pending_tasks');
    expect(h.llamadasSkill[0].payload).toMatchObject({ tenantId: TENANT, userId: 'u-comercial' });
  });

  it('una tool MCP sin el módulo del rol se deniega antes de ejecutarse', async () => {
    const resultado = await pedir('u-comercial', [{ nombre: 'volkern_list_catalogo', args: {} }]);

    expect(resultado.herramientas).toEqual([]);
    expect(h.llamadasMcp).toEqual([]);
    expect(h.respuestas.join(' ')).toContain('sin_permiso');
  });

  it('una skill de escritura exige el permiso del módulo', async () => {
    const resultado = await pedir('u-lectura', [
      { nombre: 'update_deal', args: { nombre: 'Ana Propia', etapa: 'ganado' } },
    ]);

    expect(resultado.herramientas).toEqual([]);
    expect(h.llamadasSkill).toEqual([]);
    expect(h.respuestas.join(' ')).toContain('sin_permiso');
  });

  it('la ejecución no tiene puerta trasera: sin autorización lanza y no toca la skill', async () => {
    await expect(
      ejecutarHerramientaDelAgente(
        'get_pending_tasks',
        {},
        {
          tenantId: TENANT,
          userId: 'u-vacio',
          autorizacion: { usuario: rol(ROL_SIN_PERMISOS) },
        }
      )
    ).rejects.toBeInstanceOf(PermisoDenegadoError);

    expect(h.llamadasSkill).toEqual([]);
    expect(h.llamadasMcp).toEqual([]);
  });

  it('una herramienta inventada se deniega aunque el rol tenga todo', async () => {
    const resultado = await pedir('u-catalogo', [{ nombre: 'borrar_todo_el_crm', args: {} }]);

    expect(resultado.herramientas).toEqual([]);
    expect(h.respuestas.join(' ')).toContain('sin_permiso');
  });
});

describe('restricciones de la empresa (mcp_tool_capabilities)', () => {
  it('un override de empresa cierra una tool MCP aunque el RBAC la abra', async () => {
    // Control: sin override, el rol con catalogo.ver sí puede y la ve.
    expect(autorizarHerramienta('volkern_list_catalogo', rol(ROL_CATALOGO)).permitido).toBe(true);

    sembrar({
      mcpToolCapability: [
        { tenantId: TENANT, toolName: 'volkern_list_catalogo', roleName: null, decision: 'deny' },
      ],
    });

    const restricciones = await cargarRestriccionesMcp(TENANT);
    expect(
      autorizarHerramienta('volkern_list_catalogo', rol(ROL_CATALOGO), restricciones).permitido
    ).toBe(false);

    const resultado = await pedir('u-catalogo', [{ nombre: 'volkern_list_catalogo', args: {} }]);

    // Ni se ofrece al modelo ni se ejecuta si el modelo la pide igualmente.
    expect(h.herramientasAlModelo[0]).not.toContain('volkern_list_catalogo');
    expect(resultado.herramientas).toEqual([]);
    expect(h.llamadasMcp).toEqual([]);
    expect(h.respuestas.join(' ')).toContain('sin_permiso');
  });

  it('un override de aprobación tampoco se ejecuta en el chat, que no tiene bandeja', async () => {
    sembrar({
      mcpToolCapability: [
        { tenantId: TENANT, toolName: 'volkern_list_catalogo', roleName: null, decision: 'ask' },
      ],
    });

    const resultado = await pedir('u-catalogo', [{ nombre: 'volkern_list_catalogo', args: {} }]);

    expect(resultado.herramientas).toEqual([]);
    expect(h.llamadasMcp).toEqual([]);
    expect(h.respuestas.join(' ')).toContain('sin_permiso');
  });

  it('el override de un rol concreto no cierra la tool para los demás roles', async () => {
    sembrar({
      mcpToolCapability: [
        { tenantId: TENANT, toolName: 'volkern_list_catalogo', roleName: 'Catálogo', decision: 'deny' },
      ],
    });

    const resultado = await pedir('u-administracion', [{ nombre: 'volkern_list_catalogo', args: {} }]);

    expect(resultado.herramientas).toEqual(['volkern_list_catalogo']);
    expect(h.llamadasMcp).toHaveLength(1);
  });

  it('la restricción de otra empresa no se aplica a este tenant', async () => {
    sembrar({
      mcpToolCapability: [
        { tenantId: 'tenant-b', toolName: 'volkern_list_catalogo', roleName: null, decision: 'deny' },
      ],
    });

    const resultado = await pedir('u-catalogo', [{ nombre: 'volkern_list_catalogo', args: {} }]);

    expect(resultado.herramientas).toEqual(['volkern_list_catalogo']);
    expect(h.llamadasMcp).toHaveLength(1);
  });
});
