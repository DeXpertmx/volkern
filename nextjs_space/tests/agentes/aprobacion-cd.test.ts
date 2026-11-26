/**
 * Etapa C — Aprobación de clase C/D conectada al flujo MCP.
 *
 * Una herramienta destructiva (cancel_booking, clase D) no se ejecuta en el
 * turno del chat: crea una `McpApprovalRequest` (la misma bandeja que ve el
 * responsable por MCP) y devuelve la acción como pendiente. La ejecución sólo
 * ocurre cuando la ruta de aprobaciones la concede, con la identidad de quien
 * la pidió y re-comprobando el permiso del rol.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { reiniciarPrisma } from '../ayuda/prisma-en-memoria';

const h = vi.hoisted(() => ({
  llamadasSkill: [] as Array<{ nombre: string; payload: Record<string, any> }>,
}));

vi.mock('@/lib/db', async () => {
  const { prismaActual } = await import('../ayuda/prisma-en-memoria');
  const delegado = new Proxy({}, { get: (_t, prop: string) => (prismaActual.prisma as any)[prop] });
  return { prisma: delegado, default: delegado, globalPrisma: delegado, getTenantDb: async () => delegado };
});

vi.mock('@/lib/skills', () => ({
  executeSkill: async (nombre: string, payload: Record<string, any>) => {
    h.llamadasSkill.push({ nombre, payload });
    return { id: 'cita-1', estado: 'cancelada' };
  },
}));

// El «modelo» se guiona: pide las herramientas que indica el test y devuelve
// un resumen fijo. Así se puede probar el turno en el que la única herramienta
// queda pendiente de aprobación sin depender de un LLM real.
const guionPendiente: Array<{ nombre: string; args: Record<string, any> }> = [];
vi.mock('@/lib/assistant/openrouter-client', () => ({
  callAssistantWithToolLoop: async (
    _mensajes: unknown,
    _herramientas: unknown,
    ejecutar: (nombre: string, args: Record<string, any>) => Promise<string>
  ) => {
    for (const paso of guionPendiente) await ejecutar(paso.nombre, paso.args);
    return { choices: [{ message: { content: 'He dejado la cancelación pendiente de aprobación.' } }] };
  },
}));

import {
  ejecutarHerramientaDelAgente,
  ejecutarHerramientaAprobadaDelChat,
  AprobacionRequeridaError,
  PermisoDenegadoError,
} from '@/lib/agents/tool-registry';

const TENANT = 'tenant-a';
const ROL_AGENDA = { id: 'r-agenda', nombre: 'Agenda', permisos: { citas: { ver: true, crear: true, cancelar: true } } };
const ROL_LECTURA = { id: 'r-lectura', nombre: 'Lectura', permisos: { citas: { ver: true } } };

function ctx(userId: string, role: typeof ROL_AGENDA) {
  return {
    tenantId: TENANT,
    userId,
    autorizacion: { usuario: { role, existe: true } },
  };
}

beforeEach(() => {
  reiniciarPrisma({
    tenant: [{ id: TENANT, nombre: 'Inmobiliaria A' }],
    user: [
      { id: 'u-agenda', tenantId: TENANT, name: 'Agenda', role: ROL_AGENDA },
      { id: 'u-lectura', tenantId: TENANT, name: 'Lectura', role: ROL_LECTURA },
    ],
    mcpToolCapability: [],
    mcpApprovalRequest: [],
  });
  h.llamadasSkill.length = 0;
  guionPendiente.length = 0;
});

describe('aprobación de clase C/D desde el chat', () => {
  it('cancel_booking no se ejecuta: crea la solicitud y lanza AprobacionRequeridaError', async () => {
    const error = await ejecutarHerramientaDelAgente(
      'cancel_booking',
      { nombre: 'Ana', fecha: '2026-12-01' },
      ctx('u-agenda', ROL_AGENDA)
    ).then(
      () => null,
      (e: unknown) => e
    );

    expect(error).toBeInstanceOf(AprobacionRequeridaError);
    expect((error as AprobacionRequeridaError).approvalId).toBeTruthy();
    expect(h.llamadasSkill).toEqual([]);

    const { prismaActual } = await import('../ayuda/prisma-en-memoria');
    const pendientes = prismaActual.tablas.mcpApprovalRequest ?? [];
    expect(pendientes).toHaveLength(1);
    expect(pendientes[0]).toMatchObject({
      tenantId: TENANT,
      toolName: 'cancel_booking',
      requestedById: 'u-agenda',
      via: '/api/chat',
    });
    expect(pendientes[0].argumentsHash).toBeTruthy();
  });

  it('la aprobación ejecuta la herramienta con la identidad de quien la pidió', async () => {
    const resultado = await ejecutarHerramientaAprobadaDelChat({
      tenantId: TENANT,
      userId: 'u-agenda',
      toolName: 'cancel_booking',
      args: { nombre: 'Ana', fecha: '2026-12-01' },
    });

    expect(resultado).toEqual({ id: 'cita-1', estado: 'cancelada' });
    expect(h.llamadasSkill).toHaveLength(1);
    expect(h.llamadasSkill[0].nombre).toBe('cancel_booking');
    expect(h.llamadasSkill[0].payload).toMatchObject({ tenantId: TENANT, userId: 'u-agenda' });
  });

  it('la ejecución aprobada conserva la clave de idempotencia del hilo', async () => {
    const base = {
      tenantId: TENANT,
      userId: 'u-agenda',
      toolName: 'cancel_booking',
      args: { nombre: 'Ana', fecha: '2026-12-01' },
      conversacionId: 'conv-1',
    };

    const primera = await ejecutarHerramientaAprobadaDelChat(base);
    const repetida = await ejecutarHerramientaAprobadaDelChat(base);
    const otroHilo = await ejecutarHerramientaAprobadaDelChat({ ...base, conversacionId: 'conv-2' });

    expect(primera.idempotente).toBeFalsy();
    expect(repetida).toMatchObject({ idempotente: true });
    expect(otroHilo.idempotente).toBeFalsy();
    expect(h.llamadasSkill).toHaveLength(2);
  });

  it('un rol sin permiso de cancelar sigue denegado aunque la solicitud esté aprobada', async () => {
    await expect(
      ejecutarHerramientaAprobadaDelChat({
        tenantId: TENANT,
        userId: 'u-lectura',
        toolName: 'cancel_booking',
        args: {},
      })
    ).rejects.toBeInstanceOf(PermisoDenegadoError);

    expect(h.llamadasSkill).toEqual([]);
  });
});

describe('turno del agente con una acción pendiente (no se descarta)', () => {
  it('cancel_booking como única herramienta devuelve texto y pendientes, sin ejecutar nada', async () => {
    guionPendiente.push({ nombre: 'cancel_booking', args: { nombre: 'Ana', fecha: '2026-12-01' } });

    const { ejecutarAgenteCrm } = await import('@/lib/agents/crm-tool-agent');
    const resultado = await ejecutarAgenteCrm({
      message: 'cancela la cita de Ana',
      tenantId: TENANT,
      userId: 'u-agenda',
    });

    // Nada ejecutado: la acción quedó a la espera de aprobación.
    expect(resultado.herramientas).toEqual([]);
    expect(h.llamadasSkill).toEqual([]);

    // Pero el turno no se descarta: conserva texto y la acción pendiente, que es
    // lo que el chat muestra como «Acción pendiente de aprobación».
    expect(resultado.texto).toBeTruthy();
    expect(resultado.estructura.pendientes).toHaveLength(1);
    expect(resultado.estructura.pendientes[0]).toMatchObject({ tool: 'cancel_booking', estado: 'pendiente' });
  });
});
