// @vitest-environment node
/**
 * Seguridad y concurrencia del gate ante fallos.
 *
 * Lo que se protege aquí es lo que un reintento o una caída vuelven peligroso:
 *   - cada usuario reserva su propio envío: nunca hereda el de otro;
 *   - un fallo de PostgreSQL deja el gate cerrado, sin ejecutar ni crear nada;
 *   - cerrar o confirmar una solicitud no se cae por un error de escritura;
 *   - un ACK que no se puede guardar se rechaza (el webhook lo contiene) en vez
 *     de darse por bueno.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  filas: [] as any[],
  createError: null as any,
  findFirstError: null as any,
  updateError: null as any,
}))

vi.mock('@/lib/db', () => ({
  prisma: {
    auditLog: { create: vi.fn(async () => ({})) },
    mcpToolCapability: { findMany: async () => [] },
    mcpApprovalRequest: {
      create: async ({ data }: any) => {
        if (h.createError) throw h.createError
        const duplicada = data.operationId
          ? h.filas.some(
              (f) =>
                f.tenantId === data.tenantId &&
                f.requestedById === data.requestedById &&
                f.operationId === data.operationId
            )
          : h.filas.some(
              (f) =>
                f.status === 'pending' &&
                f.operationId === null &&
                f.tenantId === data.tenantId &&
                f.requestedById === data.requestedById &&
                f.toolName === data.toolName &&
                f.argumentsHash === data.argumentsHash
            )
        if (duplicada) throw Object.assign(new Error('unique'), { code: 'P2002' })
        const fila = { id: `ap-${h.filas.length + 1}`, status: 'pending', result: null, ...data }
        h.filas.push(fila)
        return { id: fila.id }
      },
      findFirst: async ({ where }: any) => {
        if (h.findFirstError) throw h.findFirstError
        return (
          h.filas.find((f) =>
            Object.entries(where).every(([campo, valor]) => f[campo] === valor)
          ) ?? null
        )
      },
      update: async ({ where, data }: any) => {
        if (h.updateError) throw h.updateError
        const fila = h.filas.find((f) => f.id === where.id)
        if (!fila) throw new Error('fila inesperada')
        Object.assign(fila, data)
        return fila
      },
    },
  },
}))

import { prisma } from '@/lib/db'
import { completeApproval, enforceToolGate } from '@/lib/mcp/tool-gate'
import { registrarEntregaDeWhatsapp } from '@/lib/mcp/whatsapp-entrega'

const auditCreate = vi.mocked(prisma.auditLog.create)

const llamar = (userId: string, args: Record<string, unknown>) =>
  enforceToolGate({
    tenantId: 'tenant-a',
    userId,
    roleName: 'Admin',
    toolName: 'volkern_delete_contact',
    args,
    via: '/mcp',
  })

beforeEach(() => {
  vi.restoreAllMocks()
  h.filas = []
  h.createError = null
  h.findFirstError = null
  h.updateError = null
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('dos usuarios simultáneos', () => {
  it('con el mismo mensaje y sin operationId cada uno reserva la suya', async () => {
    const [ana, luis] = await Promise.all([
      llamar('user-ana', { id: 'c-1' }),
      llamar('user-luis', { id: 'c-1' }),
    ])

    expect(h.filas).toHaveLength(2)
    expect(ana.kind).toBe('ask')
    expect((ana as any).approvalId).not.toBe((luis as any).approvalId)
  })

  it('con operationId distintos son dos operaciones separadas', async () => {
    const [ana, luis] = await Promise.all([
      llamar('user-ana', { id: 'c-1', operationId: 'op-ana' }),
      llamar('user-luis', { id: 'c-1', operationId: 'op-luis' }),
    ])

    expect(h.filas).toHaveLength(2)
    expect((ana as any).approvalId).not.toBe((luis as any).approvalId)
  })
})

describe('reintentos', () => {
  it('el mismo operationId tras un fallo devuelve el fallo y no reenvía', async () => {
    h.filas.push({
      id: 'ap-1',
      tenantId: 'tenant-a',
      requestedById: 'user-ana',
      operationId: 'op-1',
      status: 'failed',
      result: { ok: false, desenlace: 'incierto' },
      expiresAt: new Date(Date.now() + 60_000),
    })

    const res = await llamar('user-ana', { id: 'c-1', operationId: 'op-1' })

    expect(res.kind).toBe('replay')
    expect((res as any).status).toBe('failed')
    expect(h.filas).toHaveLength(1)
  })
})

describe('fallos de PostgreSQL', () => {
  it('si no se puede leer la operación previa, el gate falla cerrado', async () => {
    h.findFirstError = Object.assign(new Error('conexión perdida'), { code: 'P1001' })

    await expect(llamar('user-ana', { id: 'c-1', operationId: 'op-1' })).rejects.toThrow(
      'conexión perdida'
    )
    expect(h.filas).toHaveLength(0)
  })

  it('si no se puede crear la solicitud, no se ejecuta ni se audita como creada', async () => {
    h.createError = Object.assign(new Error('sin conexión'), { code: 'P1001' })

    await expect(llamar('user-ana', { id: 'c-1' })).rejects.toThrow('sin conexión')
    expect(h.filas).toHaveLength(0)
    expect(auditCreate).not.toHaveBeenCalled()
  })

  it('cerrar la solicitud no propaga un fallo de escritura', async () => {
    h.filas.push({ id: 'ap-1', status: 'pending' })
    h.updateError = new Error('base caída')

    await expect(
      completeApproval({ approvalId: 'ap-1', ok: true, result: { ok: true } })
    ).resolves.toBeUndefined()
  })
})

describe('fallos del proveedor WhatsApp', () => {
  it('un ACK que no se puede guardar se rechaza, no se da por confirmado', async () => {
    h.filas.push({
      id: 'ap-1',
      tenantId: 'tenant-a',
      status: 'failed',
      entregaEstado: null,
      result: null,
      whatsappMessageId: 'wamid-1',
    })
    h.updateError = new Error('base caída')

    await expect(
      registrarEntregaDeWhatsapp({ messageId: 'wamid-1', estado: 'entregado' })
    ).rejects.toThrow('base caída')
    expect(h.filas[0].entregaEstado).toBeNull()
    expect(h.filas[0].status).toBe('failed')
  })
})
