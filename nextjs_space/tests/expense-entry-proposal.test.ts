import { describe, expect, it } from 'vitest'
import { buildExpenseEntryProposal } from '@/lib/finance/expense-entry-proposal'

describe('buildExpenseEntryProposal', () => {
  it('propone una partida balanceada para un gasto profesional con IVA e IRPF', () => {
    const proposal = buildExpenseEntryProposal({
      category: 'profesional',
      amount: '1210.00',
      taxableBase: '1000',
      vatAmount: '210',
      irpfAmount: '-150',
    })

    expect(proposal.expenseAccountCode).toBe('623')
    expect(proposal.supplierPayable).toBe(1060)
    expect(proposal.totalMatches).toBe(true)
    expect(proposal.balanced).toBe(true)
    expect(proposal.lines).toEqual([
      { accountCode: '623', accountName: 'Servicios de profesionales independientes', debit: 1000, credit: 0 },
      { accountCode: '472', accountName: 'IVA soportado', debit: 210, credit: 0 },
      { accountCode: '410', accountName: 'Acreedores por prestaciones de servicios', debit: 0, credit: 1060 },
      { accountCode: '4751', accountName: 'HP acreedora por retenciones practicadas', debit: 0, credit: 150 },
    ])
  })

  it('propone autorrepercusión para una adquisición intracomunitaria', () => {
    const proposal = buildExpenseEntryProposal({
      category: 'otros',
      amount: '1000',
      taxableBase: '1000',
      vatRate: '21',
      vatAmount: '',
      operationType: 'intracomunitaria',
    })

    expect(proposal.requiresFiscalReview).toBe(true)
    expect(proposal.reverseChargeVat).toBe(210)
    expect(proposal.totalMatches).toBe(true)
    expect(proposal.balanced).toBe(true)
    expect(proposal.lines).toEqual([
      { accountCode: '629', accountName: 'Otros servicios', debit: 1000, credit: 0 },
      { accountCode: '472', accountName: 'IVA soportado (autorrepercusión)', debit: 210, credit: 0 },
      { accountCode: '477', accountName: 'IVA autorrepercutido', debit: 0, credit: 210 },
      { accountCode: '410', accountName: 'Acreedores por prestaciones de servicios', debit: 0, credit: 1000 },
    ])
  })

  it('elimina el IVA español en una operación exenta', () => {
    const proposal = buildExpenseEntryProposal({
      category: 'otros',
      amount: '1000',
      taxableBase: '1000',
      vatRate: '21',
      vatAmount: '210',
      operationType: 'exenta',
    })

    expect(proposal.vatAmount).toBe(0)
    expect(proposal.totalMatches).toBe(true)
    expect(proposal.lines).toHaveLength(2)
  })

  it('separa los tramos de IVA y el recargo de equivalencia', () => {
    const proposal = buildExpenseEntryProposal({
      category: 'suministros',
      amount: '718.20',
      taxableBase: '600',
      vatAmount: '87',
      surchargeAmount: '31.20',
      vatBreakdown: [
        { rate: 21, base: 300, amount: 63 },
        { rate: 10, base: 200, amount: 20 },
        { rate: 4, base: 100, amount: 4 },
      ],
    })

    expect(proposal.totalMatches).toBe(true)
    expect(proposal.balanced).toBe(true)
    expect(proposal.lines.map(line => [line.accountCode, line.debit, line.credit])).toEqual([
      ['628', 600, 0],
      ['472', 63, 0],
      ['472', 20, 0],
      ['472', 4, 0],
      ['472', 31.2, 0],
      ['410', 0, 718.2],
    ])
  })

  it('marca la diferencia cuando el total detectado no cuadra', () => {
    const proposal = buildExpenseEntryProposal({
      category: 'otros',
      amount: '700',
      taxableBase: '600',
      vatAmount: '87',
      surchargeAmount: '31.20',
    })

    expect(proposal.balanced).toBe(true)
    expect(proposal.totalMatches).toBe(false)
    expect(proposal.difference).toBeCloseTo(18.2, 2)
  })
})
