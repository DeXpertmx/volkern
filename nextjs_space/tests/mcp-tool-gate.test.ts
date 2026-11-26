/**
 * Gate de herramientas MCP.
 *
 * Tres bloques:
 *   1. La matriz de riesgo × rol (función pura, sin base de datos).
 *   2. `enforceToolGate`: la decisión y la creación de la solicitud.
 *   3. `claimApproval`: el bloqueo de fila, que es lo que garantiza que una
 *      acción aprobada se ejecute UNA sola vez.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db', () => ({
  prisma: {
    auditLog: { create: vi.fn().mockResolvedValue({}) },
    mcpToolCapability: { findMany: vi.fn().mockResolvedValue([]) },
    mcpApprovalRequest: {
      create: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
      findMany: vi.fn().mockResolvedValue([]),
    },
    $transaction: vi.fn(),
  },
}))

import { prisma } from '@/lib/db'
import { decideToolCall, TOOL_POLICIES, listToolPolicies } from '@/lib/mcp/tool-policy'
import { enforceToolGate, claimApproval, hashToolArguments } from '@/lib/mcp/tool-gate'
import { VOLKERN_TOOLS } from '../mcp-server/src/tools-catalog'

const capFindMany = vi.mocked(prisma.mcpToolCapability.findMany)
const approvalCreate = vi.mocked(prisma.mcpApprovalRequest.create)
const auditCreate = vi.mocked(prisma.auditLog.create)
const transaction = vi.mocked(prisma.$transaction)

beforeEach(() => {
  vi.clearAllMocks()
  capFindMany.mockResolvedValue([] as never)
  auditCreate.mockResolvedValue({} as never)
})

describe('Matriz de riesgo × rol', () => {
  it('clasifica exactamente las 43 herramientas del catálogo MCP', () => {
    expect(listToolPolicies()).toHaveLength(43)
    expect(VOLKERN_TOOLS.map((t) => t.name).sort()).toEqual(Object.keys(TOOL_POLICIES).sort())
  })

  it('deniega por defecto una herramienta no clasificada', () => {
    const r = decideToolCall({ toolName: 'volkern_inventada', roleName: 'Admin' })
    expect(r.decision).toBe('deny')
    expect(r.reason).toContain('no está clasificada')
  })

  it('permite las lecturas a cualquier rol, incluso uno personalizado', () => {
    for (const rol of ['Admin', 'Sales Agent', 'Rol Raro', null]) {
      const r = decideToolCall({ toolName: 'volkern_list_contacts', roleName: rol })
      expect(r.decision, `rol ${rol}`).toBe('allow')
    }
  })

  it('las escrituras de un rol personalizado piden aprobación, no se permiten', () => {
    const r = decideToolCall({ toolName: 'volkern_create_note', roleName: 'Rol Raro' })
    expect(r.decision).toBe('ask')
  })

  it('un borrado físico se deniega a un comercial', () => {
    const r = decideToolCall({ toolName: 'volkern_delete_contact', roleName: 'Sales Agent' })
    expect(r.decision).toBe('deny')
    expect(r.risk).toBe('destructive')
  })

  it('un borrado físico pide aprobación incluso a OWNER: ningún rol lo ejecuta solo', () => {
    for (const rol of ['OWNER', 'Superadmin', 'Admin']) {
      expect(decideToolCall({ toolName: 'volkern_delete_contact', roleName: rol }).decision, rol).toBe('ask')
    }
  })

  it('enviar un WhatsApp pide aprobación siempre: es irreversible y sale del sistema', () => {
    for (const rol of ['OWNER', 'Admin', 'Sales Agent']) {
      expect(decideToolCall({ toolName: 'volkern_send_whatsapp', roleName: rol }).decision, rol).toBe('ask')
    }
  })

  it('un override de empresa puede restringir una escritura permitida', () => {
    const r = decideToolCall({
      toolName: 'volkern_create_lead',
      roleName: 'Admin',
      overrides: [{ roleName: null, decision: 'deny' }],
    })
    expect(r.decision).toBe('deny')
    expect(r.source).toBe('override-empresa')
  })

  it('un override puede aflojar una escritura para un rol personalizado', () => {
    const r = decideToolCall({
      toolName: 'volkern_create_note',
      roleName: 'Rol Raro',
      overrides: [{ roleName: 'Rol Raro', decision: 'allow' }],
    })
    expect(r.decision).toBe('allow')
    expect(r.source).toBe('override-rol')
  })

  it('un override NO puede habilitar lo irreversible: el techo de la matriz es intocable', () => {
    const borrado = decideToolCall({
      toolName: 'volkern_delete_contact',
      roleName: 'Admin',
      overrides: [{ roleName: null, decision: 'allow' }],
    })
    expect(borrado.decision).toBe('ask')

    const whatsapp = decideToolCall({
      toolName: 'volkern_send_whatsapp',
      roleName: 'Admin',
      overrides: [{ roleName: null, decision: 'allow' }],
    })
    expect(whatsapp.decision).toBe('ask')
  })

  it('el override del rol concreto manda sobre el de toda la empresa', () => {
    const r = decideToolCall({
      toolName: 'volkern_create_lead',
      roleName: 'Sales Agent',
      overrides: [
        { roleName: null, decision: 'ask' },
        { roleName: 'Sales Agent', decision: 'allow' },
      ],
    })
    expect(r.decision).toBe('allow')
    expect(r.source).toBe('override-rol')
  })
})

describe('enforceToolGate', () => {
  const base = {
    tenantId: 'tenant-a',
    userId: 'user-a',
    roleName: 'Sales Agent',
    args: { page: 1, tenantId: 'tenant-a', userId: 'user-a' },
    via: '/mcp' as const,
  }

  it('permite una lectura sin crear ninguna solicitud', async () => {
    const out = await enforceToolGate({ ...base, toolName: 'volkern_list_contacts' })
    expect(out.kind).toBe('allow')
    expect(approvalCreate).not.toHaveBeenCalled()
    expect(auditCreate).not.toHaveBeenCalled()
  })

  it('deniega un borrado a un comercial y lo audita', async () => {
    const out = await enforceToolGate({ ...base, toolName: 'volkern_delete_contact' })
    expect(out.kind).toBe('deny')
    expect(approvalCreate).not.toHaveBeenCalled()
    expect(auditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ accion: 'MCP_tool_denied', entidadId: 'volkern_delete_contact' }),
      })
    )
  })

  it('pide aprobación para un WhatsApp y devuelve el id de la solicitud', async () => {
    approvalCreate.mockResolvedValue({ id: 'ap-1' } as never)

    const out = await enforceToolGate({
      ...base,
      roleName: 'Admin',
      toolName: 'volkern_send_whatsapp',
      args: { telefono: '+34...', mensaje: 'hola', tenantId: 'tenant-a', userId: 'user-a' },
    })

    expect(out.kind).toBe('ask')
    if (out.kind !== 'ask') throw new Error('esperaba ask')
    expect(out.approvalId).toBe('ap-1')
    expect(auditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ accion: 'MCP_tool_approval_requested' }),
      })
    )
  })

  it('reutiliza la solicitud pendiente idéntica en vez de duplicarla', async () => {
    approvalCreate.mockRejectedValue({ code: 'P2002' })
    vi.mocked(prisma.mcpApprovalRequest.findFirst).mockResolvedValue({ id: 'ap-ya-existe' } as never)

    const out = await enforceToolGate({
      ...base,
      roleName: 'Admin',
      toolName: 'volkern_delete_contact',
      args: { id: 'c-1', tenantId: 'tenant-a', userId: 'user-a' },
    })

    expect(out.kind).toBe('ask')
    if (out.kind !== 'ask') throw new Error('esperaba ask')
    expect(out.approvalId).toBe('ap-ya-existe')
  })

  it('cierra la puerta si la credencial no identifica empresa', async () => {
    const out = await enforceToolGate({
      ...base,
      tenantId: undefined,
      toolName: 'volkern_list_contacts',
    })
    expect(out.kind).toBe('deny')
    expect(out.reason).toContain('no puede autorizar')
  })

  it('respeta el override guardado en la base de datos', async () => {
    capFindMany.mockResolvedValue([{ roleName: null, decision: 'deny' }] as never)

    const out = await enforceToolGate({ ...base, toolName: 'volkern_list_contacts' })
    expect(out.kind).toBe('deny')
  })
})

describe('claimApproval — la acción se ejecuta una sola vez', () => {
  /** Fila real simulada: el estado vive aquí y el `update` de la tx lo cambia. */
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
      $queryRaw: vi.fn(async (_strings: TemplateStringsArray, id: string, tenantId: string) =>
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

    prisma.$transaction = vi.fn(async (cb: any) => cb(tx)) as never
    return { fila, tx }
  }

  it('bloquea la fila y la marca aprobada', async () => {
    const { fila, tx } = montarFila()

    const res = await claimApproval({
      approvalId: 'ap-1',
      tenantId: 'tenant-a',
      resolverId: 'user-aprueba',
      action: 'approve',
    })

    expect(res.status).toBe('approved')
    expect(tx.$queryRaw).toHaveBeenCalled()
    expect(fila.status).toBe('approved')
    expect(fila.resolvedById).toBe('user-aprueba')
  })

  it('el segundo intento encuentra el estado cambiado y NO vuelve a aprobar', async () => {
    const { fila, tx } = montarFila()

    const primera = await claimApproval({
      approvalId: 'ap-1',
      tenantId: 'tenant-a',
      resolverId: 'user-aprueba',
      action: 'approve',
    })
    expect(primera.status).toBe('approved')

    const segunda = await claimApproval({
      approvalId: 'ap-1',
      tenantId: 'tenant-a',
      resolverId: 'user-otro',
      action: 'approve',
    })

    expect(segunda.status).toBe('conflict')
    // Sólo un update: el segundo intento no tocó la fila.
    expect(tx.mcpApprovalRequest.update).toHaveBeenCalledTimes(1)
    expect(fila.resolvedById).toBe('user-aprueba')
  })

  it('impide que quien solicita la acción la apruebe', async () => {
    montarFila({ requestedById: 'user-solicita' })

    const res = await claimApproval({
      approvalId: 'ap-1',
      tenantId: 'tenant-a',
      resolverId: 'user-solicita',
      action: 'approve',
    })

    expect(res.status).toBe('self_approval')
  })

  it('no encuentra solicitudes de otra empresa', async () => {
    montarFila()

    const res = await claimApproval({
      approvalId: 'ap-1',
      tenantId: 'tenant-b',
      resolverId: 'user-aprueba',
      action: 'approve',
    })

    expect(res.status).toBe('not_found')
  })

  it('caduca una solicitud vencida en vez de ejecutarla', async () => {
    montarFila({ expiresAt: new Date(Date.now() - 1000) })

    const res = await claimApproval({
      approvalId: 'ap-1',
      tenantId: 'tenant-a',
      resolverId: 'user-aprueba',
      action: 'approve',
    })

    expect(res.status).toBe('expired')
  })

  it('rechazar marca la solicitud sin ejecutar nada', async () => {
    const { fila } = montarFila()

    const res = await claimApproval({
      approvalId: 'ap-1',
      tenantId: 'tenant-a',
      resolverId: 'user-aprueba',
      action: 'reject',
    })

    expect(res.status).toBe('rejected')
    expect(fila.status).toBe('rejected')
  })

  it('una solicitud ask_code NO se aprueba sin el código de WhatsApp', async () => {
    const { fila, tx } = montarFila({
      toolName: 'volkern_send_whatsapp',
      whatsappCodeHash: '$2a$10$hashdelcodigo',
      whatsappVerificationToken: 'a'.repeat(48),
    })

    const res = await claimApproval({
      approvalId: 'ap-1',
      tenantId: 'tenant-a',
      resolverId: 'user-aprueba',
      action: 'approve',
    })

    expect(res.status).toBe('code_required')
    // La fila no se toca: sigue pendiente y sin resolver.
    expect(tx.mcpApprovalRequest.update).not.toHaveBeenCalled()
    expect(fila.status).toBe('pending')
  })

  it('rechazar una solicitud ask_code sí se permite: desactivar es seguro', async () => {
    const { fila } = montarFila({
      toolName: 'volkern_send_whatsapp',
      whatsappCodeHash: '$2a$10$hashdelcodigo',
      whatsappVerificationToken: 'a'.repeat(48),
    })

    const res = await claimApproval({
      approvalId: 'ap-1',
      tenantId: 'tenant-a',
      resolverId: 'user-aprueba',
      action: 'reject',
    })

    expect(res.status).toBe('rejected')
    expect(fila.status).toBe('rejected')
  })

  it('el hash de argumentos no depende del orden de las claves', () => {
    const a = hashToolArguments({ a: 1, b: { c: 2, d: 3 } })
    const b = hashToolArguments({ b: { d: 3, c: 2 }, a: 1 })
    expect(a).toBe(b)
    expect(a).not.toBe(hashToolArguments({ a: 1, b: { c: 2, d: 4 } }))
  })
})
