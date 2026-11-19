/**
 * P4 — Idempotencia de las herramientas del agente.
 *
 * Un doble clic o un reintento no puede crear dos notas, dos tareas ni dos
 * interacciones. La clave es (usuario, conversación, herramienta, argumentos):
 * el mismo hilo y el mismo contenido sí se deduplican; otro hilo, otro usuario
 * u otros argumentos son operaciones distintas.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { reiniciarPrisma, prismaActual } from '../ayuda/prisma-en-memoria';

const h = vi.hoisted(() => ({
  guion: [] as Array<{ nombre: string; args: Record<string, any> }>,
  respuestas: [] as string[],
}));

vi.mock('@/lib/db', async () => {
  const { prismaActual } = await import('../ayuda/prisma-en-memoria');
  const delegado = new Proxy({}, { get: (_t, prop: string) => (prismaActual.prisma as any)[prop] });
  // `default` es el import que usa la capa de idempotencia.
  return {
    prisma: delegado,
    default: delegado,
    globalPrisma: delegado,
    getTenantDb: async () => delegado,
  };
});

vi.mock('@/lib/assistant/openrouter-client', () => ({
  callAssistantWithToolLoop: async (
    _mensajes: unknown,
    _herramientas: unknown,
    ejecutar: (nombre: string, args: Record<string, any>) => Promise<string>
  ) => {
    for (const paso of h.guion) h.respuestas.push(await ejecutar(paso.nombre, paso.args));
    return { choices: [{ message: { content: 'Resumen' } }] };
  },
}));

import { claveIdempotencia, ejecutarUnaVez } from '@/lib/agents/tool-idempotency';

const TENANT = 'tenant-a';
const LEAD = 'lead-a';
const ROL_COMERCIAL = {
  id: 'r-comercial',
  nombre: 'Comercial',
  permisos: { leads: { ver: true, editar: true, crear: true } },
};

const NOTA = {
  nombre: 'crear_nota',
  args: { nombre: 'Ana Propia', contenido: 'seguimiento' },
};

function sembrar() {
  reiniciarPrisma({
    tenant: [{ id: TENANT, nombre: 'Inmobiliaria A' }],
    user: [
      { id: 'u-comercial', tenantId: TENANT, name: 'Carla', role: ROL_COMERCIAL },
      { id: 'u-comercial-2', tenantId: TENANT, name: 'Marta', role: ROL_COMERCIAL },
    ],
    lead: [{ id: LEAD, tenantId: TENANT, nombre: 'Ana Propia', email: 'ana@a.test' }],
    note: [],
    interaction: [],
    task: [],
    contact: [],
    mcpToolCapability: [],
    idempotencyRecord: [],
  });
}

async function pedir(
  userId: string,
  conversationId: string,
  pasos: Array<{ nombre: string; args: Record<string, any> }>
) {
  h.guion.length = 0;
  h.guion.push(...pasos);
  const { ejecutarAgenteCrm } = await import('@/lib/agents/crm-tool-agent');
  return ejecutarAgenteCrm({
    message: 'prueba de idempotencia',
    tenantId: TENANT,
    userId,
    conversationId,
  });
}

beforeEach(() => {
  sembrar();
  h.guion.length = 0;
  h.respuestas.length = 0;
});

describe('la misma operación no se duplica', () => {
  it('un doble clic crea una sola nota y la segunda respuesta es idempotente', async () => {
    const primera = await pedir('u-comercial', 'conv-1', [NOTA]);
    const segunda = await pedir('u-comercial', 'conv-1', [NOTA]);

    expect(prismaActual.tablas.note).toHaveLength(1);
    expect(primera.herramientas).toEqual(['crear_nota']);
    expect(segunda.herramientas).toEqual(['crear_nota']);
    expect(h.respuestas[0]).not.toContain('idempotente');
    expect(h.respuestas[1]).toContain('"idempotente":true');
  });

  it('dos peticiones simultáneas con la misma clave crean una sola nota', async () => {
    h.guion.length = 0;
    h.guion.push(NOTA);
    const { ejecutarAgenteCrm } = await import('@/lib/agents/crm-tool-agent');
    const entrada = {
      message: 'doble clic',
      tenantId: TENANT,
      userId: 'u-comercial',
      conversationId: 'conv-1',
    };

    await Promise.all([ejecutarAgenteCrm(entrada), ejecutarAgenteCrm(entrada)]);

    expect(prismaActual.tablas.note).toHaveLength(1);
  });
});

describe('lo que sí es una operación distinta', () => {
  it('el mismo texto en otro hilo se guarda aparte', async () => {
    await pedir('u-comercial', 'conv-1', [NOTA]);
    await pedir('u-comercial', 'conv-2', [NOTA]);

    expect(prismaActual.tablas.note).toHaveLength(2);
  });

  it('otros argumentos se guardan aparte', async () => {
    await pedir('u-comercial', 'conv-1', [NOTA]);
    await pedir('u-comercial', 'conv-1', [
      { nombre: 'crear_nota', args: { nombre: 'Ana Propia', contenido: 'otra cosa' } },
    ]);

    expect(prismaActual.tablas.note).toHaveLength(2);
  });

  it('otro usuario se guarda aparte', async () => {
    await pedir('u-comercial', 'conv-1', [NOTA]);
    await pedir('u-comercial-2', 'conv-1', [NOTA]);

    expect(prismaActual.tablas.note).toHaveLength(2);
  });

  it('las lecturas no se cachean: repetir una consulta vuelve a consultar', async () => {
    const buscar = { nombre: 'buscar_persona', args: { nombre: 'Ana Propia' } };
    await pedir('u-comercial', 'conv-1', [buscar]);
    await pedir('u-comercial', 'conv-1', [buscar]);

    const lecturas = prismaActual.llamadas.filter(
      (l) => l.tabla === 'lead' && l.metodo === 'findMany'
    );
    expect(lecturas).toHaveLength(2);
  });
});

describe('clave y reintentos', () => {
  it('el orden de las claves de los argumentos no cambia la clave', () => {
    const base = {
      userId: 'u-1',
      conversacionId: 'conv-1',
      herramienta: 'crear_nota',
      argumentos: { nombre: 'Ana', contenido: 'seguimiento' },
    };

    expect(claveIdempotencia({ ...base, argumentos: { contenido: 'seguimiento', nombre: 'Ana' } })).toBe(
      claveIdempotencia(base)
    );
    expect(claveIdempotencia({ ...base, conversacionId: 'conv-2' })).not.toBe(claveIdempotencia(base));
    expect(claveIdempotencia({ ...base, userId: 'u-2' })).not.toBe(claveIdempotencia(base));
    expect(claveIdempotencia({ ...base, herramienta: 'crear_tarea' })).not.toBe(claveIdempotencia(base));
  });

  it('un fallo no bloquea el reintento', async () => {
    const clave = claveIdempotencia({
      userId: 'u-1',
      conversacionId: 'conv-1',
      herramienta: 'crear_nota',
      argumentos: { nombre: 'Ana' },
    });

    await expect(
      ejecutarUnaVez(clave, async () => {
        throw new Error('boom');
      })
    ).rejects.toThrow('boom');

    const segundo = await ejecutarUnaVez(clave, async () => ({ ok: true }));
    expect(segundo).toEqual({ resultado: { ok: true }, repetida: false });
  });

  it('una ejecución completada no vuelve a ejecutar', async () => {
    const clave = claveIdempotencia({
      userId: 'u-1',
      conversacionId: 'conv-1',
      herramienta: 'crear_nota',
      argumentos: { nombre: 'Ana' },
    });

    const primera = await ejecutarUnaVez(clave, async () => ({ ok: true, id: 'n-1' }));
    const segunda = await ejecutarUnaVez(clave, async () => ({ ok: true, id: 'n-2' }));

    expect(primera).toEqual({ resultado: { ok: true, id: 'n-1' }, repetida: false });
    expect(segunda).toEqual({ resultado: { ok: true, id: 'n-1' }, repetida: true });
  });
});
