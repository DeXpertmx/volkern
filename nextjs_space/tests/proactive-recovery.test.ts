import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  tenantFindMany: vi.fn(),
  userFindFirst: vi.fn(),
  userCreate: vi.fn(),
  roleFindFirst: vi.fn(),
  roleCreate: vi.fn(),
  expenseCreate: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  prisma: {
    tenant: { findMany: mocks.tenantFindMany },
    user: { findFirst: mocks.userFindFirst, create: mocks.userCreate },
    role: { findFirst: mocks.roleFindFirst, create: mocks.roleCreate },
  },
}))

vi.mock('@/lib/skills/finance-skills', () => ({
  createExpense: vi.fn().mockResolvedValue({ id: 'exp-1' }),
}))

vi.mock('@/lib/skills/observability', () => ({
  skillsLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

import { InboundInvoiceService } from '@/lib/finance/inbound-invoice-service'
import { createExpense } from '@/lib/skills/finance-skills'

describe('InboundInvoiceService.runProactiveRecovery — sin datos mock', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.tenantFindMany.mockResolvedValue([])
    mocks.userFindFirst.mockResolvedValue(null)
    mocks.userCreate.mockResolvedValue({ id: 'bot-1' })
    mocks.roleFindFirst.mockResolvedValue(null)
    mocks.roleCreate.mockResolvedValue({ id: 'role-1' })
  })

  it('no procesa tenants sin configuración de recuperación', async () => {
    mocks.tenantFindMany.mockResolvedValue([
      { id: 't1', nombre: 'Tenant A', configuracion: {} },
      { id: 't2', nombre: 'Tenant B', configuracion: null },
    ])

    const results = await InboundInvoiceService.runProactiveRecovery()

    expect(results).toHaveLength(0)
    expect(createExpense).not.toHaveBeenCalled()
  })

  it('no procesa tenants con recuperación deshabilitada', async () => {
    mocks.tenantFindMany.mockResolvedValue([
      { id: 't1', nombre: 'Tenant A', configuracion: { recuperacionProactiva: { enabled: false } } },
    ])

    const results = await InboundInvoiceService.runProactiveRecovery()

    expect(results).toHaveLength(0)
    expect(createExpense).not.toHaveBeenCalled()
  })

  it('marca error cuando el provider no existe', async () => {
    mocks.tenantFindMany.mockResolvedValue([
      { id: 't1', nombre: 'Tenant A', configuracion: { recuperacionProactiva: { enabled: true, provider: 'proveedor_inventado' } } },
    ])

    const results = await InboundInvoiceService.runProactiveRecovery()

    expect(results).toHaveLength(1)
    expect(results[0].errors[0]).toContain('proveedor_inventado')
    expect(createExpense).not.toHaveBeenCalled()
  })

  it('adaptador verifactu es stub: devuelve [] sin crear facturas mock', async () => {
    mocks.tenantFindMany.mockResolvedValue([
      { id: 't1', nombre: 'Tenant A', configuracion: { recuperacionProactiva: { enabled: true, provider: 'verifactu' } } },
    ])

    const results = await InboundInvoiceService.runProactiveRecovery()

    expect(results).toHaveLength(1)
    expect(results[0].fetched).toBe(0)
    expect(results[0].processed).toBe(0)
    expect(createExpense).not.toHaveBeenCalled()
  })

  it('adaptador verifactu con credenciales incompletas sigue sin crear facturas', async () => {
    mocks.tenantFindMany.mockResolvedValue([
      { id: 't1', nombre: 'Tenant A', configuracion: { recuperacionProactiva: { enabled: true, provider: 'verifactu', credentials: {} } } },
    ])

    const results = await InboundInvoiceService.runProactiveRecovery()

    expect(results).toHaveLength(1)
    expect(results[0].fetched).toBe(0)
    expect(createExpense).not.toHaveBeenCalled()
  })
})
