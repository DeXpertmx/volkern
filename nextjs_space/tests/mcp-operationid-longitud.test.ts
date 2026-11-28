/**
 * Longitud del `operationId` fuera del gate JSON-RPC.
 *
 * El gate ya se prueba en `mcp-tool-gate.test.ts`. Aquí se fija el contrato de
 * las otras dos entradas: el formato simplificado de `/api/mcp` y el camino del
 * agente (`requestAgentToolApproval`). Un id de más de 200 caracteres se
 * rechaza tal cual, sin recortarlo a 200: si se truncara, el error diría 200 y
 * la solicitud se crearía con una identidad distinta a la que mandó el cliente.
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
  handleCallTool: vi.fn(),
  handleListTools: vi.fn(() => ({ tools: [] })),
  handleServerInfo: vi.fn(() => ({ name: 'volkern-crm', version: '2.0.0' })),
  MCP_SERVER_INFO: { name: 'volkern-crm', version: '2.0.0' },
}))

import { authenticateRequest } from '@/lib/api-key-auth'
import { prisma } from '@/lib/db'
import { requestAgentToolApproval } from '@/lib/mcp/tool-gate'

const authenticateMock = vi.mocked(authenticateRequest)
const approvalCreate = vi.mocked(prisma.mcpApprovalRequest.create)

const OPERATION_ID_LARGO = 'x'.repeat(201)
const OPERATION_ID_LIMITE = 'x'.repeat(200)

beforeEach(() => {
  vi.clearAllMocks()
  authenticateMock.mockResolvedValue({
    valid: true,
    authMethod: 'apikey',
    tenant: { id: CRED_TENANT, nombre: 'Tenant A' },
    // Rol con permiso: así el rechazo que se prueba es el del id, no el del rol.
    user: { id: CRED_USER, email: 'a@volkern.app', role: { nombre: 'Admin' } },
    apiKey: { id: 'key-1', nombre: 'test', scopes: ['mcp:execute'] },
  } as never)
})

describe('POST /api/mcp — formato simplificado', () => {
  it('rechaza un operationId de 201 caracteres sin truncarlo ni crear la solicitud', async () => {
    const { POST } = await import('@/app/api/mcp/route')
    const res = await POST(
      new Request('https://volkern.app/api/mcp', {
        method: 'POST',
        body: JSON.stringify({
          tool: 'volkern_delete_contact',
          arguments: { id: 'c-1', operationId: OPERATION_ID_LARGO },
        }),
        headers: { Authorization: 'Bearer vk_test' },
      }) as never
    )
    const body = await res.json()

    expect(res.status).toBe(403)
    // Si se hubiera recortado, el motivo diría 200 y la puerta habría seguido.
    expect(body.error).toContain('200 caracteres')
    expect(body.error).toContain('201')
    expect(approvalCreate).not.toHaveBeenCalled()
  })

  it('acepta exactamente 200 caracteres y los guarda sin recortar', async () => {
    const { POST } = await import('@/app/api/mcp/route')
    const res = await POST(
      new Request('https://volkern.app/api/mcp', {
        method: 'POST',
        body: JSON.stringify({
          tool: 'volkern_delete_contact',
          arguments: { id: 'c-1', operationId: OPERATION_ID_LIMITE },
        }),
        headers: { Authorization: 'Bearer vk_test' },
      }) as never
    )

    // El borde se acepta: la llamada sigue a la aprobación, no se deniega.
    expect(res.status).toBe(409)
    const creada = approvalCreate.mock.calls[0][0] as { data: { operationId: string } }
    expect(creada.data.operationId).toBe(OPERATION_ID_LIMITE)
  })
})

describe('camino del agente', () => {
  it('rechaza un operationId de 201 caracteres antes de crear la solicitud', async () => {
    await expect(
      requestAgentToolApproval({
        tenantId: CRED_TENANT,
        userId: CRED_USER,
        roleName: 'Admin',
        toolName: 'volkern_delete_contact',
        args: { id: 'c-1', operationId: OPERATION_ID_LARGO },
        risk: 'destructive',
      })
    ).rejects.toThrow(/200 caracteres.*201/)

    expect(approvalCreate).not.toHaveBeenCalled()
  })

  it('acepta exactamente 200 caracteres y los guarda sin recortar', async () => {
    const res = await requestAgentToolApproval({
      tenantId: CRED_TENANT,
      userId: CRED_USER,
      roleName: 'Admin',
      toolName: 'volkern_delete_contact',
      args: { id: 'c-1', operationId: OPERATION_ID_LIMITE },
      risk: 'destructive',
    })

    expect(res.approvalId).toBe('ap-test')
    const creada = approvalCreate.mock.calls[0][0] as { data: { operationId: string } }
    expect(creada.data.operationId).toBe(OPERATION_ID_LIMITE)
  })
})
