import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  taskFindMany: vi.fn(),
  taskUpdate: vi.fn(),
  loadTelegramCredentials: vi.fn(),
  sendTelegramMessage: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  prisma: {
    task: { findMany: mocks.taskFindMany, update: mocks.taskUpdate },
  },
}))

vi.mock('@/lib/telegram', () => ({
  loadTelegramCredentials: (...args: unknown[]) => mocks.loadTelegramCredentials(...args),
  sendTelegramMessage: (...args: unknown[]) => mocks.sendTelegramMessage(...args),
}))

import { runTaskOverdueScan } from '@/lib/cron/task-overdue-jobs'

const NOW = Date.now()
const vencida = {
  id: 'task-1',
  tenantId: 'tenant-1',
  titulo: 'Llamar a Juan',
  descripcion: 'Confirmar presupuesto',
  fechaVencimiento: new Date(NOW - 2 * 24 * 60 * 60 * 1000), // venció hace 2 días
  asignadoA: 'user-42',
  asignadoUsuario: {
    id: 'user-42',
    name: 'Bruno Hess',
    metadata: { telegram_chat_id: '123456789' },
  },
}

describe('runTaskOverdueScan (aviso de tareas vencidas por Telegram)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
    mocks.taskUpdate.mockResolvedValue({ id: 'task-1' })
    mocks.loadTelegramCredentials.mockResolvedValue({ bot_token: 'BOT:TOKEN', admin_chat_id: '999' })
  })

  it('envía el aviso al chat del asignado con fecha original y motivo, y marca la tarea', async () => {
    mocks.taskFindMany.mockResolvedValue([vencida])
    mocks.sendTelegramMessage.mockResolvedValue({ success: true })

    const result = await runTaskOverdueScan()

    expect(result).toEqual({ total: 1, notified: 1, skipped: 0, failed: 0 })
    // Enviado al chat del usuario asignado, con el token del tenant
    expect(mocks.sendTelegramMessage).toHaveBeenCalledTimes(1)
    const [chatId, body, token] = mocks.sendTelegramMessage.mock.calls[0]
    expect(chatId).toBe('123456789')
    expect(token).toBe('BOT:TOKEN')
    expect(body).toContain('Tarea vencida')
    expect(body).toContain('Llamar a Juan')
    expect(body).toContain('Confirmar presupuesto')
    expect(body).toContain('Vencía el')
    // Guard contra repetidos
    expect(mocks.taskUpdate).toHaveBeenCalledWith({
      where: { id: 'task-1' },
      data: { avisoVencimientoEnviado: true },
    })
  })

  it('no notifica ni marca si el envío falla (se reintenta en el siguiente ciclo)', async () => {
    mocks.taskFindMany.mockResolvedValue([vencida])
    mocks.sendTelegramMessage.mockResolvedValue({ success: false, error: 'chat not found' })

    const result = await runTaskOverdueScan()

    expect(result).toEqual({ total: 1, notified: 0, skipped: 0, failed: 1 })
    expect(mocks.taskUpdate).not.toHaveBeenCalled()
  })

  it('marca como omitida sin enviar cuando el usuario no tiene chat de Telegram', async () => {
    mocks.taskFindMany.mockResolvedValue([
      { ...vencida, asignadoUsuario: { id: 'user-42', name: 'Bruno', metadata: {} } },
    ])

    const result = await runTaskOverdueScan()

    expect(result).toEqual({ total: 1, notified: 0, skipped: 1, failed: 0 })
    expect(mocks.sendTelegramMessage).not.toHaveBeenCalled()
    expect(mocks.taskUpdate).toHaveBeenCalledTimes(1) // marcada para no reintentar
  })

  it('marca como omitida cuando el tenant no tiene bot de Telegram configurado', async () => {
    mocks.taskFindMany.mockResolvedValue([vencida])
    mocks.loadTelegramCredentials.mockResolvedValue({ bot_token: null, admin_chat_id: null })

    const result = await runTaskOverdueScan()

    expect(result).toEqual({ total: 1, notified: 0, skipped: 1, failed: 0 })
    expect(mocks.sendTelegramMessage).not.toHaveBeenCalled()
  })

  it('solo considera tareas vencidas sin completar y sin avisar (filtro correcto)', async () => {
    mocks.taskFindMany.mockResolvedValue([])

    const result = await runTaskOverdueScan()

    expect(result).toEqual({ total: 0, notified: 0, skipped: 0, failed: 0 })
    const where = mocks.taskFindMany.mock.calls[0][0].where
    expect(where.completada).toBe(false)
    expect(where.avisoVencimientoEnviado).toBe(false)
    expect(where.fechaVencimiento.lt).toBeInstanceOf(Date)
  })
})
