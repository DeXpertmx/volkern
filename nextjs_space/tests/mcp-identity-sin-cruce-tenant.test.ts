/**
 * El tenant y el usuario de una llamada MCP se derivan SIEMPRE de la
 * credencial. Un `tenantId`/`userId` distinto en el cuerpo es un intento de
 * cruce entre empresas: 403 y auditoría, no silencio.
 *
 * Se cubren las dos superficies (`/mcp` y `/api/mcp`) y las tres formas de
 * enviar la identidad en el cuerpo (JSON-RPC `params.arguments`, raíz del
 * formato simple y `arguments` del formato simple).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const CRED_TENANT = 'tenant-a'
const CRED_USER = 'user-a'

vi.mock('@/lib/api-key-auth', () => ({
  authenticateRequest: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  prisma: {
    auditLog: { create: vi.fn().mockResolvedValue({}) },
    // El gate consulta overrides y crea solicitudes; aquí no hay ninguna.
    mcpToolCapability: { findMany: vi.fn().mockResolvedValue([]) },
    mcpApprovalRequest: {
      create: vi.fn().mockResolvedValue({ id: 'ap-test' }),
      findFirst: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue({}),
    },
  },
}))

vi.mock('@/lib/crm-entitlements', () => ({
  getCrmEntitlements: vi.fn(async () => ({ features: { api: true } })),
  crmAllows: vi.fn(() => true),
  upgradeMessage: vi.fn(() => 'Necesitas el nivel Avanzado'),
  tierRequiredFor: vi.fn(() => 'avanzado'),
  entitlementsFor: vi.fn(() => ({ features: { api: true } })),
}))

vi.mock('@/lib/mcp/mcp-handler', () => ({
  handleCallTool: vi.fn(async () => ({
    content: [{ type: 'text', text: JSON.stringify({ ok: true }) }],
    isError: false,
  })),
  handleListTools: vi.fn(() => ({ tools: [] })),
  handleServerInfo: vi.fn(() => ({ name: 'volkern-crm', version: '2.0.0' })),
  resolveSkillName: (name: string) => name.replace(/^volkern_/, ''),
  MCP_SERVER_INFO: { name: 'volkern-crm', version: '2.0.0' },
}))

import { authenticateRequest } from '@/lib/api-key-auth'
import { handleCallTool } from '@/lib/mcp/mcp-handler'
import { prisma } from '@/lib/db'

const authenticateMock = vi.mocked(authenticateRequest)
const callToolMock = vi.mocked(handleCallTool)
const auditCreate = prisma.auditLog.create as unknown as ReturnType<typeof vi.fn>

/** Credencial válida con tenant y usuario (es el caso de las API keys: ambos existen siempre). */
function credencial(tenantId: string | null = CRED_TENANT, userId: string | null = CRED_USER) {
  return {
    valid: true,
    authMethod: 'apikey',
    tenant: tenantId ? { id: tenantId, nombre: 'Tenant A' } : undefined,
    user: userId ? { id: userId, email: 'a@volkern.app' } : undefined,
    apiKey: { id: 'key-1', nombre: 'test', scopes: ['mcp:execute'] },
  }
}

async function postMcp(payload: unknown) {
  const { POST } = await import('@/app/mcp/route')
  const res = await POST(
    new Request('https://volkern.app/mcp', { method: 'POST', body: JSON.stringify(payload) })
  )
  return { status: res.status, body: await res.json() }
}

async function postApiMcp(payload: unknown) {
  const { POST } = await import('@/app/api/mcp/route')
  const res = await POST(
    new Request('https://volkern.app/api/mcp', {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: { Authorization: 'Bearer vk_test' },
    }) as never
  )
  return { status: res.status, body: await res.json() }
}

beforeEach(() => {
  vi.clearAllMocks()
  authenticateMock.mockResolvedValue(credencial() as never)
})

describe('/mcp — identidad desde la credencial', () => {
  it('rechaza con 403 un tenantId distinto al de la credencial y lo audita', async () => {
    const { status, body } = await postMcp({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: 'volkern_list_contacts', arguments: { tenantId: 'tenant-b' } },
    })

    expect(status).toBe(403)
    expect(body.error.code).toBe(-32001)
    expect(body.error.message).toContain('tenantId')
    expect(callToolMock).not.toHaveBeenCalled()
    expect(auditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          accion: 'MCP_identity_rejected',
          tenantId: CRED_TENANT,
          metadata: expect.objectContaining({ field: 'tenantId', requested: 'tenant-b' }),
        }),
      })
    )
  })

  it('rechaza con 403 un userId distinto al de la credencial (atribución falsa)', async () => {
    const { status, body } = await postMcp({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: { name: 'volkern_list_contacts', arguments: { userId: 'user-b' } },
    })

    expect(status).toBe(403)
    expect(body.error.code).toBe(-32001)
    expect(body.error.message).toContain('userId')
    expect(callToolMock).not.toHaveBeenCalled()
  })

  it('acepta que el cliente repita el tenantId y userId de su propia credencial', async () => {
    const { status } = await postMcp({
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: {
        name: 'volkern_list_contacts',
        arguments: { tenantId: CRED_TENANT, userId: CRED_USER, page: 1 },
      },
    })

    expect(status).toBe(200)
    expect(callToolMock).toHaveBeenCalledWith(
      expect.objectContaining({
        arguments: expect.objectContaining({ tenantId: CRED_TENANT, userId: CRED_USER, page: 1 }),
      })
    )
  })

  it('sin identidad en el cuerpo usa la de la credencial', async () => {
    const { status } = await postMcp({
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/call',
      params: { name: 'volkern_list_contacts', arguments: { page: 1 } },
    })

    expect(status).toBe(200)
    expect(callToolMock).toHaveBeenCalledWith(
      expect.objectContaining({
        arguments: expect.objectContaining({ tenantId: CRED_TENANT, userId: CRED_USER, source: 'mcp' }),
      })
    )
  })
})

describe('/api/mcp — identidad desde la credencial', () => {
  it('rechaza en JSON-RPC un tenantId distinto en params.arguments', async () => {
    const { status, body } = await postApiMcp({
      jsonrpc: '2.0',
      id: 10,
      method: 'tools/call',
      params: { name: 'volkern_list_contacts', arguments: { tenantId: 'tenant-b' } },
    })

    expect(status).toBe(403)
    expect(body.error.code).toBe(-32001)
    expect(callToolMock).not.toHaveBeenCalled()
    expect(auditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ accion: 'MCP_identity_rejected' }),
      })
    )
  })

  it('rechaza en JSON-RPC un userId distinto en params.arguments', async () => {
    const { status } = await postApiMcp({
      jsonrpc: '2.0',
      id: 11,
      method: 'tools/call',
      params: { name: 'volkern_list_contacts', arguments: { userId: 'user-b' } },
    })

    expect(status).toBe(403)
    expect(callToolMock).not.toHaveBeenCalled()
  })

  it('rechaza en formato simple un tenantId distinto en la raíz del body', async () => {
    const { status, body } = await postApiMcp({
      tool: 'volkern_list_contacts',
      arguments: { page: 1 },
      tenantId: 'tenant-b',
    })

    expect(status).toBe(403)
    expect(body.field).toBe('tenantId')
    expect(callToolMock).not.toHaveBeenCalled()
  })

  it('rechaza un tenantId distinto escondido dentro de arguments (formato simple)', async () => {
    const { status } = await postApiMcp({
      tool: 'volkern_list_contacts',
      arguments: { tenantId: 'tenant-b' },
    })

    expect(status).toBe(403)
    expect(callToolMock).not.toHaveBeenCalled()
  })

  it('rechaza un tenantId que la credencial no puede verificar (credencial sin tenant)', async () => {
    authenticateMock.mockResolvedValue(credencial(null) as never)

    const { status } = await postApiMcp({
      tool: 'volkern_list_contacts',
      arguments: { tenantId: 'tenant-b' },
    })

    expect(status).toBe(403)
    expect(callToolMock).not.toHaveBeenCalled()
  })

  it('formato simple sin identidad en el cuerpo usa la de la credencial', async () => {
    const { status } = await postApiMcp({
      tool: 'volkern_list_contacts',
      arguments: { page: 2 },
    })

    expect(status).toBe(200)
    expect(callToolMock).toHaveBeenCalledWith(
      expect.objectContaining({
        arguments: expect.objectContaining({
          tenantId: CRED_TENANT,
          userId: CRED_USER,
          page: 2,
          source: 'mcp',
        }),
      })
    )
  })
})
