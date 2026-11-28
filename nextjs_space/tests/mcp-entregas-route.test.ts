// @vitest-environment node
/**
 * Bandeja administrativa de envíos sin desenlace confirmado.
 *
 * Lo que se protege: que solo se listen los envíos abiertos de la empresa, que
 * cerrar a mano no reabra una solicitud ya ejecutada por error y que el
 * reintento no mande nada por su cuenta: vuelve a pasar por el gate, que exige
 * aprobación otra vez, y no se permite a ciegas si el envío pudo haber llegado.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  auth: {
    tenant: { id: 'tenant-a' } as { id: string } | null,
    user: { id: 'user-admin', role: { nombre: 'Admin' } } as any,
  },
  filas: [] as any[],
  gate: null as any,
}))

vi.mock('@/lib/api-key-auth', () => ({
  withTenantAuth: (handler: any) => async (request: any, context: any) =>
    handler(request, h.auth, context),
}))

vi.mock('@/lib/db', () => ({
  prisma: {
    mcpApprovalRequest: {
      findMany: async () => h.filas,
      findFirst: async ({ where }: any) =>
        h.filas.find((f) => f.id === where.id && f.tenantId === where.tenantId) ?? null,
      update: async ({ where, data }: any) => {
        const fila = h.filas.find((f) => f.id === where.id)!
        Object.assign(fila, data)
        return fila
      },
    },
    auditLog: { create: async () => ({}) },
  },
}))

vi.mock('@/lib/mcp/tool-gate', () => ({
  enforceToolGate: vi.fn(async () => h.gate),
}))

import { enforceToolGate } from '@/lib/mcp/tool-gate'
import { GET, POST } from '@/app/api/mcp/approvals/entregas/route'

const gate = vi.mocked(enforceToolGate)

function envio(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ap-1',
    tenantId: 'tenant-a',
    toolName: 'volkern_send_whatsapp',
    status: 'failed',
    arguments: { leadId: 'lead-1', mensaje: 'Hola', operationId: 'op-1' },
    whatsappMessageId: null,
    entregaEstado: null,
    entregaActualizadaEn: null,
    createdAt: new Date('2026-11-27T10:00:00Z'),
    executedAt: null,
    result: null,
    ...overrides,
  }
}

const pedir = (metodo: string, body?: unknown) =>
  new Request('http://localhost/api/mcp/approvals/entregas', {
    method: metodo,
    body: body === undefined ? undefined : JSON.stringify(body),
  }) as any

beforeEach(() => {
  vi.clearAllMocks()
  h.filas = [envio(), envio({ id: 'ap-2', entregaEstado: 'entregado' })]
  h.auth = {
    tenant: { id: 'tenant-a' },
    user: { id: 'user-admin', role: { nombre: 'Admin' } },
  }
  h.gate = null
})

describe('GET /api/mcp/approvals/entregas', () => {
  it('lista los envíos abiertos y resume el mensaje', async () => {
    h.filas = [envio({ arguments: { leadId: 'lead-1', mensaje: 'x'.repeat(300) } })]

    const res = await GET(pedir('GET'))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.total).toBe(1)
    expect(body.envios[0]).toMatchObject({ id: 'ap-1', leadId: 'lead-1', whatsappMessageId: null })
    expect(body.envios[0].mensaje.length).toBeLessThanOrEqual(161)
  })

  it('no deja la bandeja a un rol sin responsabilidad', async () => {
    h.auth = { tenant: { id: 'tenant-a' }, user: { id: 'u', role: { nombre: 'Sales Agent' } } }

    const res = await GET(pedir('GET'))
    expect(res.status).toBe(403)
  })
})

describe('POST /api/mcp/approvals/entregas', () => {
  it('confirma a mano la entrega y resuelve la solicitud fallida', async () => {
    const res = await POST(pedir('POST', { approvalId: 'ap-1', action: 'confirmar_entrega' }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.entregaEstado).toBe('entregado')
    expect(h.filas[0].entregaEstado).toBe('entregado')
    expect(h.filas[0].status).toBe('executed')
  })

  it('no reintenta a ciegas cuando el desenlace es desconocido', async () => {
    const res = await POST(pedir('POST', { approvalId: 'ap-1', action: 'reintentar' }))

    expect(res.status).toBe(409)
    expect(gate).not.toHaveBeenCalled()
  })

  it('reintenta por el gate cuando consta que no se entregó', async () => {
    h.filas[0].entregaEstado = 'fallido'
    h.gate = { kind: 'ask_code', approvalId: 'ap-nueva', verificationUrl: 'http://x/verif', expiresAt: new Date() }

    const res = await POST(pedir('POST', { approvalId: 'ap-1', action: 'reintentar' }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toMatchObject({ success: true, approvalId: 'ap-nueva', tipo: 'ask_code' })
    expect(gate).toHaveBeenCalledTimes(1)
    const enviado = gate.mock.calls[0][0] as any
    expect(enviado.args.operationId).toBeUndefined()
    expect(enviado.toolName).toBe('volkern_send_whatsapp')
  })

  it('devuelve 404 si el envío no es de la empresa', async () => {
    const res = await POST(pedir('POST', { approvalId: 'ajeno', action: 'confirmar_entrega' }))
    expect(res.status).toBe(404)
  })
})
