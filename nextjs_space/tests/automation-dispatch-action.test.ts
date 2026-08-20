import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  executionCreate: vi.fn(),
  executionUpdate: vi.fn(),
  automationFindUnique: vi.fn(),
  leadFindUnique: vi.fn(),
  leadUpdate: vi.fn(),
  logCreate: vi.fn(),
  notificationSend: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  prisma: {
    automationExecution: { create: mocks.executionCreate, update: mocks.executionUpdate },
    automation: { findUnique: mocks.automationFindUnique },
    lead: { findUnique: mocks.leadFindUnique, update: mocks.leadUpdate },
    automationExecutionLog: { create: mocks.logCreate },
  },
}))

vi.mock('@/lib/skills/notification-layer', () => ({
  notificationService: { send: mocks.notificationSend },
}))

vi.mock('@/lib/skills/context', () => ({
  createSystemContext: () => ({ tenantId: 't1' }),
}))

import { AutomationEngine } from '@/lib/automation-engine'

describe('AutomationEngine.dispatchAction — no debe re-ejecutar el mismo nodo', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.executionCreate.mockResolvedValue({ id: 'exec-1' })
    mocks.executionUpdate.mockResolvedValue({ id: 'exec-1' })
    mocks.logCreate.mockResolvedValue({ id: 'log-1' })
    mocks.leadFindUnique.mockResolvedValue({ id: 'lead-1', tenantId: 't1', nombre: 'Test', email: 'a@b.com' })
    mocks.leadUpdate.mockResolvedValue({ id: 'lead-1', tenantId: 't1' })
    mocks.notificationSend.mockResolvedValue(true)
    mocks.automationFindUnique.mockResolvedValue({
      id: 'auto-1',
      activo: true,
      flowData: {
        nodes: [
          { id: 'trigger-1', type: 'trigger', data: { trigger: 'nuevo_lead', config: {} } },
          { id: 'action-1', type: 'action', data: { config: { actionType: 'asignar_a_usuario', userId: 'u1' } } },
        ],
        edges: [{ source: 'trigger-1', target: 'action-1' }],
      },
    })
  })

  it('asignar_a_usuario despacha enviar_notificacion con el config pedido y ejecuta el nodo UNA sola vez', async () => {
    const engine = new AutomationEngine('auto-1', { tenantId: 't1', leadId: 'lead-1' })
    await engine.execute()

    // El nodo asignar_a_usuario solo se ejecutó una vez (antes, dispatchAction
    // re-ejecutaba el mismo nodo → recursión infinita).
    expect(mocks.leadUpdate).toHaveBeenCalledTimes(1)
    expect(mocks.leadUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ asignadoA: 'u1' }) })
    )

    // La acción despachada (enviar_notificacion) sí se ejecutó, dirigida a u1.
    expect(mocks.notificationSend).toHaveBeenCalledTimes(1)
    const [recipient, payload] = mocks.notificationSend.mock.calls[0]
    expect(recipient).toMatchObject({ type: 'user', id: 'u1' })
    expect(payload.body).toContain('Se te ha asignado un nuevo lead')

    // La ejecución terminó como completada.
    const completion = mocks.executionUpdate.mock.calls.find(
      (c: any[]) => c[0]?.data?.estado === 'completado'
    )
    expect(completion).toBeDefined()
  })
})
