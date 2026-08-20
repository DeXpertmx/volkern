import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  leadFindMany: vi.fn(),
  auditLogFindFirst: vi.fn(),
  auditLogCreate: vi.fn(),
  triggerAutomation: vi.fn(),
}))

// Mock de prisma (scheduler.ts importa `skills` que a su vez importa prisma)
vi.mock('@/lib/db', () => ({
  prisma: {
    lead: { findMany: mocks.leadFindMany },
    auditLog: { findFirst: mocks.auditLogFindFirst, create: mocks.auditLogCreate },
  },
  getTenantDb: vi.fn(),
  dbContext: { run: vi.fn() },
}))

// Mock del import dinámico del motor de automatizaciones
vi.mock('@/lib/automation-engine', () => ({
  triggerAutomation: (...args: unknown[]) => mocks.triggerAutomation(...args),
}))

import { runLeadSinRespuestaScan } from '@/lib/cron/scheduler'

const NOW = Date.now()
const leadInactivo = {
  id: 'lead-1',
  tenantId: 'tenant-1',
  nombre: 'Juan Pérez',
  email: 'juan@example.com',
  fechaUltimaActividad: new Date(NOW - 30 * 60 * 60 * 1000), // 30h sin actividad
}

describe('runLeadSinRespuestaScan (trigger lead_sin_respuesta)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
  })

  it('dispara lead_sin_respuesta para leads inactivos >24h sin log previo', async () => {
    mocks.leadFindMany.mockResolvedValue([leadInactivo])
    mocks.auditLogFindFirst.mockResolvedValue(null) // nunca disparado
    mocks.auditLogCreate.mockResolvedValue({ id: 'log-1' })

    const result = await runLeadSinRespuestaScan(24)

    expect(result).toEqual({ total: 1, fired: 1, skipped: 0 })
    expect(mocks.triggerAutomation).toHaveBeenCalledTimes(1)
    expect(mocks.triggerAutomation).toHaveBeenCalledWith('lead_sin_respuesta', expect.objectContaining({
      tenantId: 'tenant-1',
      leadId: 'lead-1',
      source: 'cron',
    }))
    // Guard auditable registrado
    expect(mocks.auditLogCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: 'tenant-1',
        accion: 'lead_sin_respuesta',
        entidad: 'lead',
        entidadId: 'lead-1',
      }),
    })
  })

  it('omite leads ya disparados en las últimas 24h (guard contra repetidos)', async () => {
    mocks.leadFindMany.mockResolvedValue([leadInactivo])
    mocks.auditLogFindFirst.mockResolvedValue({ id: 'log-existente' }) // ya disparado

    const result = await runLeadSinRespuestaScan(24)

    expect(result).toEqual({ total: 1, fired: 0, skipped: 1 })
    expect(mocks.triggerAutomation).not.toHaveBeenCalled()
    expect(mocks.auditLogCreate).not.toHaveBeenCalled()
  })

  it('no considera leads con actividad reciente (<24h)', async () => {
    mocks.leadFindMany.mockResolvedValue([])
    mocks.auditLogFindFirst.mockResolvedValue(null)

    const result = await runLeadSinRespuestaScan(24)

    expect(result).toEqual({ total: 0, fired: 0, skipped: 0 })
    expect(mocks.triggerAutomation).not.toHaveBeenCalled()
  })

  it('no dispara leads sin tenantId', async () => {
    mocks.leadFindMany.mockResolvedValue([{ ...leadInactivo, tenantId: null }])
    mocks.auditLogFindFirst.mockResolvedValue(null)

    const result = await runLeadSinRespuestaScan(24)

    expect(result).toEqual({ total: 1, fired: 0, skipped: 0 })
    expect(mocks.triggerAutomation).not.toHaveBeenCalled()
  })

  it('sobrevive a errores de BD devolviendo un resultado con error', async () => {
    mocks.leadFindMany.mockRejectedValue(new Error('conexión caída'))

    const result = await runLeadSinRespuestaScan(24)

    expect(result.total).toBe(0)
    expect(result.error).toBe('conexión caída')
  })
})
