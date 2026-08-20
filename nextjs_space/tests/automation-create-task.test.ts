import { beforeEach, describe, expect, it, vi } from 'vitest'

const { taskCreateMock, leadFindUniqueMock } = vi.hoisted(() => ({
  taskCreateMock: vi.fn(),
  leadFindUniqueMock: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  prisma: {
    task: { create: taskCreateMock },
    lead: { findUnique: leadFindUniqueMock, update: vi.fn() },
  },
}))

import { createTask } from '@/lib/automation/actions/leads'

describe('createTask (accion crear_tarea)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    leadFindUniqueMock.mockResolvedValue({ tenantId: 't1' })
    taskCreateMock.mockResolvedValue({ id: 'task-1' })
  })

  it('crea la tarea sin la columna `estado` (no existe en el modelo Task) y usa `completada: false`', async () => {
    const ok = await createTask(
      { titulo: 'Agendar Llamada', descripcion: 'Seguimiento', tipo: 'seguimiento' },
      { state: { leadId: 'lead-1', lead: { tenantId: 't1' } } } as any,
    )

    expect(ok).toBe(true)
    expect(taskCreateMock).toHaveBeenCalledOnce()
    const data = taskCreateMock.mock.calls[0][0].data as any
    expect(data.titulo).toBe('Agendar Llamada')
    expect(data.tipo).toBe('seguimiento')
    expect(data).not.toHaveProperty('estado')
    expect(data).not.toHaveProperty('prioridad')
    expect(data.completada).toBe(false)
    expect(data.fechaVencimiento).toBeInstanceOf(Date)
  })

  it('usa el tipo y vencimiento del config cuando vienen definidos', async () => {
    await createTask(
      { titulo: 'Llamar', tipo: 'llamada', fechaVencimiento: '2026-09-01T10:00:00.000Z' },
      { state: { leadId: 'lead-1', lead: { tenantId: 't1' } } } as any,
    )

    const data = taskCreateMock.mock.calls[0][0].data as any
    expect(data.tipo).toBe('llamada')
    expect(data.fechaVencimiento.toISOString()).toBe('2026-09-01T10:00:00.000Z')
  })
})