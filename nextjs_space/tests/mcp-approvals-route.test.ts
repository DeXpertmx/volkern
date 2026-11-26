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

const cumpleRecibo = (recibo: any, where: Record<string, any>) =>
  Object.entries(where).every(([campo, condicion]: any) => {
    if (condicion && typeof condicion === 'object' && 'in' in condicion) {
      return (condicion.in as unknown[]).includes(recibo[campo])
    }
    if (condicion && typeof condicion === 'object' && 'lt' in condicion) {
      return (
        recibo[campo] != null &&
        new Date(recibo[campo]).getTime() < new Date(condicion.lt).getTime()
      )
    }
    return recibo[campo] === condicion
  })

const recibos = vi.hoisted(() => new Map<string, any>())

vi.mock('@/lib/db', () => ({
  prisma: {
    auditLog: { create: vi.fn().mockResolvedValue({}) },
    mcpApprovalRequest: { update: vi.fn().mockResolvedValue({}) },
    // El endpoint limpia el proceso pausado al rechazar (modelo real en Prisma).
    agentConversationContext: { delete: vi.fn().mockResolvedValue({}) },
    // Recibos de idempotencia de los envíos WhatsApp.
    whatsappSendReceipt: {
      create: async ({ data }: any) => {
        if (recibos.has(data.key)) {
          throw Object.assign(new Error('clave duplicada'), { code: 'P2002' })
        }
        const ahora = new Date()
        const recibo = {
          status: 'en_curso',
          result: null,
          createdAt: ahora,
          updatedAt: ahora,
          ...data,
        }
        recibos.set(data.key, recibo)
        return { ...recibo }
      },
      findUnique: async ({ where }: any) => {
        const recibo = recibos.get(where.key)
        return recibo ? { ...recibo } : null
      },
      findFirst: async ({ where }: any) => {
        for (const recibo of recibos.values()) {
          if (cumpleRecibo(recibo, where)) return { ...recibo }
        }
        return null
      },
      updateMany: async ({ where, data }: any) => {
        const recibo = recibos.get(where.key)
        if (!recibo || !cumpleRecibo(recibo, where)) return { count: 0 }
        Object.assign(recibo, data, { updatedAt: new Date() })
        return { count: 1 }
      },
      deleteMany: async ({ where }: any) => {
        const recibo = recibos.get(where.key)
        if (!recibo || !cumpleRecibo(recibo, where)) return { count: 0 }
        recibos.delete(where.key)
        return { count: 1 }
      },
    },
    $transaction: vi.fn(),
  },
}))

import { prisma } from '@/lib/db'
import { handleCallTool } from '@/lib/mcp/mcp-handler'
import { claveIdempotenciaEnvio } from '@/lib/mcp/whatsapp-idempotency'
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
  recibos.clear()
})

const CLAVE_ENVIO = claveIdempotenciaEnvio({
  tenantId: 'tenant-a',
  toolName: 'volkern_send_whatsapp',
  approvalId: 'ap-1',
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

  it('no reenvía un WhatsApp que otra solicitud ya envió', async () => {
    const { fila } = filaWhatsapp()
    recibos.set(CLAVE_ENVIO, {
      key: CLAVE_ENVIO,
      tenantId: 'tenant-a',
      toolName: 'volkern_send_whatsapp',
      approvalId: 'ap-anterior',
      status: 'enviado',
      result: { ok: true, messageId: 'wamid-1' },
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    const res = await POST(peticion('approve'), { params: { id: 'ap-1' } } as never)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.status).toBe('executed')
    expect(body.result).toMatchObject({ messageId: 'wamid-1' })
    expect(callTool).not.toHaveBeenCalled()
    expect(fila.status).toBe('executed')
  })

  it('no reenvía mientras el envío anterior sigue en curso', async () => {
    const { fila } = filaWhatsapp()
    recibos.set(CLAVE_ENVIO, {
      key: CLAVE_ENVIO,
      tenantId: 'tenant-a',
      toolName: 'volkern_send_whatsapp',
      approvalId: 'ap-anterior',
      status: 'en_curso',
      result: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    const res = await POST(peticion('approve'), { params: { id: 'ap-1' } } as never)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.status).toBe('failed')
    expect(body.result.error).toContain('envío en curso')
    expect(callTool).not.toHaveBeenCalled()
    expect(fila.status).toBe('failed')
  })

  it('el envío correcto confirma el recibo y un fallo lo libera', async () => {
    const { fila } = filaWhatsapp()
    ;(callTool as any).mockResolvedValueOnce({
      content: [{ type: 'text', text: JSON.stringify({ ok: true, enviado: true }) }],
      isError: false,
    })

    await POST(peticion('approve'), { params: { id: 'ap-1' } } as never)
    expect(recibos.get(CLAVE_ENVIO)).toMatchObject({ status: 'enviado', approvalId: 'ap-1' })

    // Segundo escenario: la herramienta responde con error y el recibo se libera.
    recibos.clear()
    const segunda = filaWhatsapp()
    ;(callTool as any).mockResolvedValueOnce({
      content: [
        { type: 'text', text: JSON.stringify({ error: 'Error 400: sin canal', desenlace: 'no_enviado' }) },
      ],
      isError: true,
    })

    const res = await POST(peticion('approve'), { params: { id: 'ap-1' } } as never)
    const body = await res.json()

    expect(body.status).toBe('failed')
    expect(recibos.size).toBe(0)
    expect(segunda.fila.status).toBe('failed')
    expect(fila.status).toBe('executed')
  })

  it('una excepción del envío deja el recibo incierto y cierra la solicitud como fallida', async () => {
    const { fila } = filaWhatsapp()
    ;(callTool as any).mockRejectedValueOnce(new Error('Evolution caída'))

    const res = await POST(peticion('approve'), { params: { id: 'ap-1' } } as never)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.status).toBe('failed')
    expect(body.result.error).toBe('Evolution caída')
    // El mensaje pudo salir: la clave se queda y bloquea el reintento.
    expect(recibos.get(CLAVE_ENVIO)).toMatchObject({ status: 'incierto' })
    expect(fila.status).toBe('failed')
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
