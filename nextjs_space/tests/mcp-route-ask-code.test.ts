// @vitest-environment node
/**
 * `/mcp` no puede saltarse la confirmación por WhatsApp.
 *
 * El gate devuelve tres decisiones: `allow`, `ask` y `ask_code`. Las dos
 * últimas NO ejecutan nada: crean una solicitud pendiente y, en `ask_code`
 * (envíos externos como `volkern_send_whatsapp`), exigen además un código de 6
 * dígitos enviado al WhatsApp del negocio.
 *
 * Lo que se protege aquí: que la ruta trate `ask_code` como `ask`. Si vuelve a
 * caer al camino de `allow`, un cliente MCP puede mandar un WhatsApp sin pasar
 * por el código, que es exactamente el bypass que tuvo este endpoint.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  handleCallTool: vi.fn(async () => ({
    content: [{ type: 'text', text: JSON.stringify({ ok: true }) }],
    isError: false,
  })),
  enforceToolGate: vi.fn(),
}))

vi.mock('@/lib/api-key-auth', () => ({
  authenticateRequest: vi.fn(async () => ({
    valid: true,
    tenant: { id: 'tenant-a' },
    user: { id: 'user-1', role: { nombre: 'OWNER' } },
  })),
}))

vi.mock('@/lib/mcp/mcp-handler', () => ({
  handleCallTool: h.handleCallTool,
  // La ruta mapea volkern_X → skill antes de ejecutar; basta con identidad.
  resolveSkillName: (name: string) => name,
}))
vi.mock('@/lib/mcp/tool-gate', () => ({ enforceToolGate: h.enforceToolGate }))
vi.mock('@/lib/db', () => ({
  prisma: { auditLog: { create: vi.fn(async () => ({})) } },
}))

import { POST } from '@/app/mcp/route'

/** tools/call JSON-RPC contra /mcp, con la tool real del catálogo. */
function peticion(name = 'volkern_send_whatsapp') {
  return new Request('https://erp.test/mcp', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer vk_prueba' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 7,
      method: 'tools/call',
      params: { name, arguments: { leadId: 'lead-1', message: 'Hola' } },
    }),
  })
}

const ahora = new Date('2026-11-26T22:00:00.000Z')

beforeEach(() => {
  vi.clearAllMocks()
})

describe('POST /mcp — confirmación obligatoria antes de ejecutar', () => {
  it('ask_code devuelve 409 con el código pendiente y NO ejecuta la herramienta', async () => {
    h.enforceToolGate.mockResolvedValue({
      kind: 'ask_code',
      decision: 'ask',
      reason: 'Se envió un código de autorización al WhatsApp del negocio.',
      risk: 'external',
      approvalId: 'ap-code-1',
      expiresAt: new Date('2026-11-27T22:00:00.000Z'),
      verificationToken: 'tok-123',
      verificationUrl: 'https://erp.test/confirmar?t=tok-123',
      codeExpiresAt: new Date('2026-11-26T22:10:00.000Z'),
      phoneNumberMasked: '+34 6•• ••• •21',
    })

    const res = await POST(peticion())
    const body = await res.json()

    expect(res.status).toBe(409)
    expect(body.error.code).toBe(-32002)
    expect(body.error.data).toMatchObject({
      status: 'pending',
      approvalId: 'ap-code-1',
      verificationToken: 'tok-123',
      verificationUrl: 'https://erp.test/confirmar?t=tok-123',
      phoneNumberMasked: '+34 6•• ••• •21',
    })
    expect(body.error.data.codeExpiresAt).toBe('2026-11-26T22:10:00.000Z')
    expect(h.handleCallTool).not.toHaveBeenCalled()
  })

  it('ask devuelve 409 sin credenciales de código y NO ejecuta la herramienta', async () => {
    h.enforceToolGate.mockResolvedValue({
      kind: 'ask',
      decision: 'ask',
      reason: 'Requiere aprobación de un responsable.',
      risk: 'high',
      approvalId: 'ap-1',
      expiresAt: ahora,
    })

    const res = await POST(peticion())
    const body = await res.json()

    expect(res.status).toBe(409)
    expect(body.error.data.status).toBe('pending')
    expect(body.error.data.verificationToken).toBeUndefined()
    expect(h.handleCallTool).not.toHaveBeenCalled()
  })

  it('una decisión inesperada del gate tampoco ejecuta (falla cerrada)', async () => {
    h.enforceToolGate.mockResolvedValue({
      kind: 'ask_otra_cosa',
      decision: 'ask',
      reason: 'Decisión nueva que esta ruta aún no conoce.',
      risk: 'high',
      approvalId: 'ap-x',
      expiresAt: ahora,
    } as any)

    const res = await POST(peticion())

    expect(res.status).toBe(409)
    expect(h.handleCallTool).not.toHaveBeenCalled()
  })

  it('allow sigue ejecutando la herramienta', async () => {
    h.enforceToolGate.mockResolvedValue({
      kind: 'allow',
      decision: 'allow',
      reason: 'Lectura permitida.',
      risk: 'low',
    })

    const res = await POST(peticion('volkern_list_contacts'))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.result).toMatchObject({ isError: false })
    expect(h.handleCallTool).toHaveBeenCalledTimes(1)
  })
})
