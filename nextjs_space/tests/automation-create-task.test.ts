import { beforeEach, describe, expect, it, vi } from 'vitest'

const { taskCreateMock, leadFindUniqueMock, notifyByTelegramMock } = vi.hoisted(() => ({
  taskCreateMock: vi.fn(),
  leadFindUniqueMock: vi.fn(),
  notifyByTelegramMock: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  prisma: {
    task: { create: taskCreateMock },
    lead: { findUnique: leadFindUniqueMock, update: vi.fn() },
  },
}))

vi.mock('@/lib/skills/notification-layer', () => ({
  notifyByTelegram: notifyByTelegramMock,
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

  it('notifica por Telegram con la fila de 3 botones de la tarea creada', async () => {
    taskCreateMock.mockResolvedValue({ id: 'task-1', titulo: 'Agendar Llamada', tipo: 'seguimiento', fechaVencimiento: new Date('2026-09-01T10:00:00.000Z') })
    notifyByTelegramMock.mockResolvedValue({ success: true })

    const ok = await createTask(
      { titulo: 'Agendar Llamada', tipo: 'seguimiento' },
      { state: { leadId: 'lead-1', lead: { tenantId: 't1' } } } as any,
    )

    expect(ok).toBe(true)
    expect(notifyByTelegramMock).toHaveBeenCalledOnce()
    const [message, , inlineKeyboard] = notifyByTelegramMock.mock.calls[0]
    expect(message).toContain('Nueva tarea creada por automatización')
    expect(message).toContain('Agendar Llamada')
    // La fila de 3 botones con los callbacks del webhook
    const row = inlineKeyboard[0]
    expect(row.map((b: any) => b.callback_data)).toEqual([
      'task:complete:task-1',
      'task:resched:task-1',
      'task:snooze:task-1',
    ])
  })

  it('no rompe la creación si la notificación por Telegram falla', async () => {
    notifyByTelegramMock.mockRejectedValue(new Error('chat id required'))

    const ok = await createTask(
      { titulo: 'Llamar' },
      { state: { leadId: 'lead-1', lead: { tenantId: 't1' } } } as any,
    )

    expect(ok).toBe(true)
    expect(taskCreateMock).toHaveBeenCalledOnce()
  })
})