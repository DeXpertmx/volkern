/**
 * Resolución de aprobaciones MCP de punta a punta (endpoint + gate).
 *
 * Lo que se protege aquí es lo que de verdad puede romper:
 *   - que la herramienta se ejecute UNA sola vez aunque se apruebe dos veces;
 *   - que se ejecute con la identidad de quien la pidió, no con la de quien
 *     aprueba (aprobar no es actuar);
 *   - que sólo un responsable pueda resolver, y nunca el propio solicitante.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const auth = {
  tenant: { id: 'tenant-a' } as { id: string } | null,
  user: { id: 'user-aprueba', role: { nombre: 'Admin' } } as
    | { id: string; role: { nombre: string } }
    | null,
}

vi.mock('@/lib/api-key-auth', () => ({
  withTenantAuth: (handler: any) => async (request: any, context: any) =>
    handler(request, auth, context),
}))

vi.mock('@/lib/mcp/mcp-handler', () => ({
  handleCallTool: vi.fn(async () => ({
    content: [{ type: 'text', text: JSON.stringify({ ok: true, borrado: 'c-1' }) }],
    isError: false,
  })),
}))

vi.mock('@/lib/db', () => ({
  prisma: {
    auditLog: { create: vi.fn().mockResolvedValue({}) },
    mcpApprovalRequest: { update: vi.fn().mockResolvedValue({}) },
    // El endpoint limpia el proceso pausado al rechazar (modelo real en Prisma).
    agentConversationContext: { delete: vi.fn().mockResolvedValue({}) },
    $transaction: vi.fn(),
  },
}))

import { prisma } from '@/lib/db'
import { handleCallTool } from '@/lib/mcp/mcp-handler'
import { POST } from '@/app/api/mcp/approvals/[id]/route'

const callTool = vi.mocked(handleCallTool)
const auditCreate = vi.mocked(prisma.auditLog.create)

/** Fila viva: el update de la transacción cambia su estado, como en Postgres. */
function montarFila(overrides: Record<string, unknown> = {}) {
  const fila: Record<string, any> = {
    id: 'ap-1',
    tenantId: 'tenant-a',
    toolName: 'volkern_delete_contact',
    arguments: { id: 'c-1' },
    argumentsHash: 'hash-1',
    operationId: null,
    requestedById: 'user-solicita',
    roleName: 'Sales Agent',
    via: '/mcp',
    status: 'pending',
    expiresAt: new Date(Date.now() + 60_000),
    ...overrides,
  }

  const tx = {
    $queryRaw: vi.fn(async (_s: TemplateStringsArray, id: string, tenantId: string) =>
      fila.id === id && fila.tenantId === tenantId ? [{ ...fila }] : []
    ),
    mcpApprovalRequest: {
      update: vi.fn(async ({ where, data }: any) => {
        if (where.id !== fila.id) throw new Error('fila inesperada')
        Object.assign(fila, data)
        return { ...fila }
      }),
    },
  }

  ;(prisma.$transaction as any) = vi.fn(async (cb: any) => cb(tx)) as never
  // `completeApproval` escribe por el cliente global, no por la transacción:
  // se enlaza a la misma fila para poder comprobar el estado final.
  ;(prisma.mcpApprovalRequest.update as any) = vi.fn(async ({ where, data }: any) => {
    if (where.id !== fila.id) throw new Error('fila inesperada')
    Object.assign(fila, data)
    return { ...fila }
  }) as never
  return { fila, tx }
}

function peticion(action: 'approve' | 'reject') {
  return new Request('http://localhost/api/mcp/approvals/ap-1', {
    method: 'POST',
    body: JSON.stringify({ action }),
  }) as never
}

beforeEach(() => {
  vi.clearAllMocks()
  auth.tenant = { id: 'tenant-a' }
  auth.user = { id: 'user-aprueba', role: { nombre: 'Admin' } }
  auditCreate.mockResolvedValue({} as never)
})

function filaWhatsapp() {
  return montarFila({
    toolName: 'volkern_send_whatsapp',
    arguments: { leadId: 'lead-1', mensaje: 'Hola' },
  })
}

describe('POST /api/mcp/approvals/[id]', () => {
  it('ejecuta la herramienta con la identidad del solicitante', async () => {
    montarFila()

    const res = await POST(peticion('approve'), { params: { id: 'ap-1' } } as never)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.status).toBe('executed')
    expect(callTool).toHaveBeenCalledWith({
      name: 'volkern_delete_contact',
      arguments: expect.objectContaining({
        id: 'c-1',
        tenantId: 'tenant-a',
        userId: 'user-solicita',
        source: 'mcp',
      }),
    })
  })

  it('una segunda aprobación NO vuelve a ejecutar: 409 y una sola llamada', async () => {
    montarFila()

    const primera = await POST(peticion('approve'), { params: { id: 'ap-1' } } as never)
    const segunda = await POST(peticion('approve'), { params: { id: 'ap-1' } } as never)
    const bodySegunda = await segunda.json()

    expect(primera.status).toBe(200)
    expect(segunda.status).toBe(409)
    // El conflicto devuelve el estado real de la fila: la primera aprobación ya
    // la ejecutó, así que la segunda no puede volver a hacerlo.
    expect(bodySegunda.status).toBe('executed')
    expect(callTool).toHaveBeenCalledTimes(1)
  })

  it('rechazar cierra la solicitud sin ejecutar nada', async () => {
    montarFila()

    const res = await POST(peticion('reject'), { params: { id: 'ap-1' } } as never)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.status).toBe('rejected')
    expect(callTool).not.toHaveBeenCalled()
  })

  it('no ejecuta una aprobación ask_code sin el código verificado: 409 code_required', async () => {
    montarFila({
      toolName: 'volkern_send_whatsapp',
      whatsappCodeHash: '$2a$10$hashdelcodigo',
      whatsappVerificationToken: 'a'.repeat(48),
    })

    const res = await POST(peticion('approve'), { params: { id: 'ap-1' } } as never)
    const body = await res.json()

    expect(res.status).toBe(409)
    expect(body.status).toBe('code_required')
    expect(body.verificationUrl).toContain('/mcp/autorizar/')
    expect(callTool).not.toHaveBeenCalled()
  })

  it('quien solicitó la acción no puede aprobarla', async () => {
    montarFila()
    auth.user = { id: 'user-solicita', role: { nombre: 'Admin' } }

    const res = await POST(peticion('approve'), { params: { id: 'ap-1' } } as never)

    expect(res.status).toBe(403)
    expect(callTool).not.toHaveBeenCalled()
  })

  it('un rol que no es responsable no puede resolver aprobaciones', async () => {
    montarFila()
    auth.user = { id: 'user-vendedor', role: { nombre: 'Sales Agent' } }

    const res = await POST(peticion('approve'), { params: { id: 'ap-1' } } as never)

    expect(res.status).toBe(403)
    expect(callTool).not.toHaveBeenCalled()
  })

  it('no resuelve solicitudes de otra empresa', async () => {
    montarFila()
    auth.tenant = { id: 'tenant-b' }

    const res = await POST(peticion('approve'), { params: { id: 'ap-1' } } as never)

    expect(res.status).toBe(404)
    expect(callTool).not.toHaveBeenCalled()
  })

  it('una excepción del envío cierra la solicitud como fallida', async () => {
    const { fila } = filaWhatsapp()
    ;(callTool as any).mockRejectedValueOnce(new Error('Evolution caída'))

    const res = await POST(peticion('approve'), { params: { id: 'ap-1' } } as never)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.status).toBe('failed')
    expect(body.result.error).toBe('Evolution caída')
    expect(fila.status).toBe('failed')
    // La solicitud ya se gastó: no hay nada que liberar ni un recibo paralelo.
    expect(callTool).toHaveBeenCalledTimes(1)
  })

  it('exige una acción válida', async () => {
    montarFila()

    const res = await POST(
      new Request('http://localhost/api/mcp/approvals/ap-1', {
        method: 'POST',
        body: JSON.stringify({ action: 'ejecutar-ya' }),
      }) as never,
      { params: { id: 'ap-1' } } as never
    )

    expect(res.status).toBe(400)
    expect(callTool).not.toHaveBeenCalled()
  })
})
