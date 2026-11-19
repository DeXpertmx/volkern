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
