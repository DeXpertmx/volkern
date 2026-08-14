import { describe, expect, it } from 'vitest'
import { EXPENSE_CATEGORIES, accountForExpenseCategory } from '@/lib/finance/expense-categories'

describe('expense-categories (catálogo único)', () => {
  it('expone las 13 categorías del set unificado con cuenta del Grupo 6', () => {
    expect(EXPENSE_CATEGORIES).toHaveLength(13)
    const values = EXPENSE_CATEGORIES.map(c => c.value)
    expect(values).toEqual([
      'mercaderias', 'materias_primas', 'transporte', 'suministros', 'alquiler',
      'oficina', 'tecnologia', 'marketing', 'profesional', 'mantenimiento',
      'seguros', 'banca', 'otros',
    ])
    for (const c of EXPENSE_CATEGORIES) {
      expect(c.accountCode).toMatch(/^6\d\d$/)
    }
  })

  it('mapea mercaderias a la cuenta 600 (Compras de mercaderías)', () => {
    const r = accountForExpenseCategory('mercaderias')
    expect(r.code).toBe('600')
    expect(r.name).toBe('Compras de mercaderías')
  })

  it('mapea marketing a 627 (Publicidad) y no a 629', () => {
    const r = accountForExpenseCategory('marketing')
    expect(r.code).toBe('627')
  })

  it('mapea materias primas, mantenimiento, seguros y banca a sus cuentas', () => {
    expect(accountForExpenseCategory('materias_primas').code).toBe('601')
    expect(accountForExpenseCategory('mantenimiento').code).toBe('622')
    expect(accountForExpenseCategory('seguros').code).toBe('625')
    expect(accountForExpenseCategory('banca').code).toBe('626')
  })

  it('reconoce texto libre con keywords (formato OCR/legacy)', () => {
    expect(accountForExpenseCategory('compras de supermercado').code).toBe('600')
    expect(accountForExpenseCategory('Google Ads campaign').code).toBe('627')
    expect(accountForExpenseCategory('honorarios de asesoría fiscal').code).toBe('623')
    expect(accountForExpenseCategory('factura de luz Endesa').code).toBe('628')
    expect(accountForExpenseCategory('reparación del local').code).toBe('622')
  })

  it('cae a 629 Otros servicios para categorías desconocidas o vacías', () => {
    expect(accountForExpenseCategory('').code).toBe('629')
    expect(accountForExpenseCategory('gastos raros').code).toBe('629')
  })
})
