/**
 * Aprobación y rechazo de una solicitud que pausó el proceso inmobiliario.
 *
 * El gate (claim, auditoría, ejecución única) ya se prueba en
 * `mcp-approvals-route.test.ts`. Aquí sólo lo que añade el proceso pausado: la
 * acción aprobada hereda la identidad y el hilo de quien la pidió —su clave de
 * idempotencia— y los pasos que quedaban se reanudan; rechazar descarta ese
 * estado sin ejecutar nada. Proceso y persistencia son los reales (Prisma en
 * memoria), así que las claves que se afirman las escribe el sistema.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { reiniciarPrisma, prismaActual } from './ayuda/prisma-en-memoria';

const h = vi.hoisted(() => ({
  envio: vi.fn(async () => ({ ok: true, id: 'msg-1' })),
  nota: vi.fn(async () => ({ id: 'nota-1' })),
  aprobacion: {
    id: 'ap-1',
    tenantId: 'tenant-a',
    toolName: 'send_message',
    arguments: {
      nombre: 'Lucía Ferrer',
      email: 'lucia@example.com',
      mensaje: 'Hola Lucía, te envío las opciones que vimos.',
      canal: 'email',
    },
    requestedById: 'user-solicita',
    roleName: 'Comercial',
    via: '/api/chat',
  },
}));

const auth = {
  tenant: { id: 'tenant-a' },
  user: { id: 'user-aprueba', role: { nombre: 'Admin' } },
};

vi.mock('@/lib/api-key-auth', () => ({
  withTenantAuth: (handler: any) => async (request: any, context: any) =>
    handler(request, auth, context),
}));

// El gate se resuelve aquí; lo que se prueba es lo que hace la ruta después.
vi.mock('@/lib/mcp/tool-gate', () => ({
  VIA_CHAT: '/api/chat',
  claimApproval: vi.fn(async ({ action }: { action: 'approve' | 'reject' }) => ({
    status: action === 'approve' ? 'approved' : 'rejected',
    approval: h.aprobacion,
  })),
  completeApproval: vi.fn(async () => {}),
  auditApprovalOutcome: vi.fn(async () => {}),
  requestAgentToolApproval: vi.fn(),
}));

vi.mock('@/lib/skills', () => ({
  executeSkill: h.envio,
  skills: { create_note: h.nota },
}));

vi.mock('@/lib/db', async () => {
  const { prismaActual } = await import('./ayuda/prisma-en-memoria');
  const delegado = new Proxy({}, { get: (_t, prop: string) => (prismaActual.prisma as any)[prop] });
  return { prisma: delegado, default: delegado, globalPrisma: delegado, getTenantDb: async () => delegado };
});

// La reanudación real se prueba con proceso y persistencia reales; aquí sólo
// se sustituye para poder forzar el fallo que la ruta debe tolerar.
vi.mock('@/lib/agents/proceso-pendiente', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/agents/proceso-pendiente')>();
  return { ...real, reanudarProcesoAprobado: vi.fn(real.reanudarProcesoAprobado) };
});

import { guardarProcesoPendiente, reanudarProcesoAprobado } from '@/lib/agents/proceso-pendiente';
import { completeApproval } from '@/lib/mcp/tool-gate';
import { POST } from '@/app/api/mcp/approvals/[id]/route';

/** Permisos justos para enviar el mensaje y anotar en la ficha. */
const ROL_COMERCIAL = {
  id: 'r-1',
  nombre: 'Comercial',
  permisos: {
    leads: { editar: true },
    mensajes: { enviar: true },
  },
};

/** Ficha del comprador y usuario que pidió la acción, como en el turno real. */
function sembrarBase() {
  reiniciarPrisma({
    tenant: [{ id: 'tenant-a' }],
    user: [{ id: 'user-solicita', tenantId: 'tenant-a', role: ROL_COMERCIAL }],
    lead: [{ id: 'lead-lucia', tenantId: 'tenant-a', nombre: 'Lucía Ferrer', email: 'lucia@example.com' }],
  });
}

/** Proceso que se detuvo en el envío: solo queda registrar el resultado. */
async function sembrarProcesoPausado() {
  await guardarProcesoPendiente({
    approvalId: 'ap-1',
    nombreProceso: 'proceso_inmobiliario',
    tenantId: 'tenant-a',
    userId: 'user-solicita',
    conversacionId: 'conv-11',
    pasos: [
      {
        nombre: 'registrar_resultados',
        herramienta: 'crear_nota',
        args: { nombre: 'Lucía Ferrer', contenido: 'Se envió el seguimiento.' },
        esencial: false,
      },
    ],
  });
}

function peticion(action: 'approve' | 'reject') {
  return new Request('http://localhost/api/mcp/approvals/ap-1', {
    method: 'POST',
    body: JSON.stringify({ action }),
  }) as never;
}

const clavesDeIdempotencia = () =>
  prismaActual.tablas.idempotencyRecord.map((registro: any) => registro.key as string);

beforeEach(() => {
  vi.clearAllMocks();
  sembrarBase();
});

describe('POST /api/mcp/approvals/[id] con un proceso pausado', () => {
  it('al aprobar ejecuta con el hilo del proceso y reanuda los pasos pendientes', async () => {
    await sembrarProcesoPausado();

    const res = await POST(peticion('approve'), { params: { id: 'ap-1' } } as never);
    const body = await res.json();

    expect(body.status).toBe('executed');

    // Ni el envío aprobado ni los pasos reanudados usan una clave nueva: las
    // dos son las del turno de quien pidió el envío.
    expect(h.envio).toHaveBeenCalledTimes(1);
    expect(clavesDeIdempotencia()).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^agente:user-solicita:conv-11:send_message:/),
        expect.stringMatching(/^agente:user-solicita:conv-11:crear_nota:/),
      ])
    );

    // Los pasos que quedaban corren y consumen el estado guardado.
    expect(body.proceso.pasos.map((paso: any) => ({ nombre: paso.nombre, estado: paso.estado }))).toEqual([
      { nombre: 'registrar_resultados', estado: 'ok' },
    ]);
    expect(prismaActual.tablas.agentConversationContext).toHaveLength(0);
  });

  it('si la acción aprobada falla, no reanuda y descarta el estado', async () => {
    await sembrarProcesoPausado();
    h.envio.mockRejectedValueOnce(new Error('SMTP caído'));

    const res = await POST(peticion('approve'), { params: { id: 'ap-1' } } as never);
    const body = await res.json();

    // El fallo se informa a quien aprueba y el resto del proceso no se ejecuta:
    // seguir anotando «se envió el seguimiento» sería falso.
    expect(body.status).toBe('failed');
    expect(body.result).toEqual({ error: 'SMTP caído' });
    expect(body.proceso).toBeNull();
    expect(h.nota).not.toHaveBeenCalled();
    expect(prismaActual.tablas.agentConversationContext).toHaveLength(0);
  });

  it('si falla la reanudación, la aprobación queda ejecutada y el estado se descarta', async () => {
    await sembrarProcesoPausado();
    vi.mocked(reanudarProcesoAprobado).mockRejectedValueOnce(new Error('paso roto'));
    const ruido = vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await POST(peticion('approve'), { params: { id: 'ap-1' } } as never);
    const body = await res.json();
    ruido.mockRestore();

    // El envío ya ocurrió: que fallen los pasos siguientes no lo deshace ni lo
    // convierte en un fallo, y la aprobación queda completada como buena.
    expect(body.status).toBe('executed');
    expect(body.result).toEqual({ ok: true, id: 'msg-1' });
    expect(reanudarProcesoAprobado).toHaveBeenCalledTimes(1);
    expect(completeApproval).toHaveBeenCalledWith({
      approvalId: 'ap-1',
      ok: true,
      result: { ok: true, id: 'msg-1' },
    });

    // No se inventa un resultado del proceso ni se deja el estado a medias.
    expect(body.proceso).toBeNull();
    expect(prismaActual.tablas.agentConversationContext).toHaveLength(0);
  });

  it('al rechazar descarta el estado sin ejecutar nada', async () => {
    await sembrarProcesoPausado();

    const res = await POST(peticion('reject'), { params: { id: 'ap-1' } } as never);
    const body = await res.json();

    expect(body.status).toBe('rejected');
    expect(h.envio).not.toHaveBeenCalled();
    expect(h.nota).not.toHaveBeenCalled();
    expect(prismaActual.tablas.agentConversationContext).toHaveLength(0);
  });
});
