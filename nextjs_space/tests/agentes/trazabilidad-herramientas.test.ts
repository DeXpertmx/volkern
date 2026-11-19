/**
 * P5 — Trazabilidad por herramienta del agente.
 *
 * Cada ejecución deja una fila en `ToolExecution` con la herramienta, los
 * argumentos saneados, el resultado, la duración y el desenlace (ok, error o
 * denegado). La autorización denegada y los errores también dejan rastro: es
 * justo lo que hoy se pierde entre el `console.log` y el resumen del modelo.
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

const TENANT = 'tenant-a';
const LEAD = 'lead-a';

const ROL_SOLO_LECTURA = { id: 'r-lectura', nombre: 'Lectura', permisos: { leads: { ver: true } } };
const ROL_COMERCIAL = {
  id: 'r-comercial',
  nombre: 'Comercial',
  permisos: { leads: { ver: true, crear: true, editar: true } },
};

function sembrar() {
  reiniciarPrisma({
    tenant: [{ id: TENANT, nombre: 'Inmobiliaria A' }],
    user: [
      { id: 'u-comercial', tenantId: TENANT, name: 'Carla', role: ROL_COMERCIAL },
      { id: 'u-lectura', tenantId: TENANT, name: 'Lola', role: ROL_SOLO_LECTURA },
    ],
    lead: [{ id: LEAD, tenantId: TENANT, nombre: 'Ana Propia', email: 'ana@a.test' }],
    note: [],
    task: [],
    interaction: [],
    contact: [],
    mcpToolCapability: [],
    idempotencyRecord: [],
    toolExecution: [],
  });
}

function trazas() {
  return prismaActual.tablas.toolExecution;
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
    message: 'prueba de trazabilidad',
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

describe('cada ejecución deja rastro', () => {
  it('una escritura guarda herramienta, identidad, argumentos y resultado', async () => {
    await pedir('u-comercial', 'conv-1', [
      { nombre: 'crear_nota', args: { nombre: 'Ana Propia', contenido: 'seguimiento' } },
    ]);

    expect(trazas()).toHaveLength(1);
    const fila = trazas()[0];
    expect(fila.tenantId).toBe(TENANT);
    expect(fila.userId).toBe('u-comercial');
    expect(fila.conversationId).toBe('conv-1');
    expect(fila.toolName).toBe('crear_nota');
    expect(fila.origin).toBe('crm');
    expect(fila.status).toBe('ok');
    expect(fila.durationMs).toBeGreaterThanOrEqual(0);
    expect(fila.arguments.nombre).toBe('Ana Propia');
    expect(fila.result.ok).toBe(true);
  });

  it('una lectura también se registra', async () => {
    await pedir('u-comercial', 'conv-1', [{ nombre: 'buscar_persona', args: { nombre: 'Ana Propia' } }]);

    expect(trazas()).toHaveLength(1);
    expect(trazas()[0].toolName).toBe('buscar_persona');
    expect(trazas()[0].status).toBe('ok');
    expect(trazas()[0].result.tipo).toBe('lead');
  });

  it('una herramienta denegada deja rastro sin resultado', async () => {
    await pedir('u-lectura', 'conv-1', [
      { nombre: 'crear_nota', args: { nombre: 'Ana Propia', contenido: 'no debería' } },
    ]);

    expect(trazas()).toHaveLength(1);
    const fila = trazas()[0];
    expect(fila.toolName).toBe('crear_nota');
    expect(fila.status).toBe('denegado');
    expect(fila.result).toBeUndefined();
    expect(prismaActual.tablas.note).toHaveLength(0);
  });

  it('un fallo de la herramienta queda con estado error y su mensaje', async () => {
    await pedir('u-comercial', 'conv-1', [
      { nombre: 'crear_nota', args: { nombre: 'Nadie Existe', contenido: 'hola' } },
    ]);

    expect(trazas()).toHaveLength(1);
    const fila = trazas()[0];
    expect(fila.status).toBe('error');
    expect(fila.errorMessage).toContain('No encontré una ficha');
    expect(fila.result).toBeUndefined();
  });

  it('una repetición idempotente se marca como tal', async () => {
    const paso = { nombre: 'crear_nota', args: { nombre: 'Ana Propia', contenido: 'seguimiento' } };
    await pedir('u-comercial', 'conv-1', [paso]);
    await pedir('u-comercial', 'conv-1', [paso]);

    expect(trazas()).toHaveLength(2);
    expect(trazas()[0].idempotent).toBe(false);
    expect(trazas()[1].idempotent).toBe(true);
    expect(prismaActual.tablas.note).toHaveLength(1);
  });
});
