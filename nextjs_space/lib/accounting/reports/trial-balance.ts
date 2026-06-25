import { prisma } from '@/lib/db'

interface TrialBalanceRow {
  code: string
  name: string
  type: string
  group: number
  debit: number
  credit: number
  balance: number
}

interface TrialBalanceReport {
  rows: TrialBalanceRow[]
  totalDebit: number
  totalCredit: number
}

export async function getTrialBalance(tenantId: string): Promise<TrialBalanceReport> {
  const accounts = await prisma.accountingAccount.findMany({
    where: { tenantId },
    orderBy: { group: 'asc' as any, code: 'asc' } as any,
  })

  const rows: TrialBalanceRow[] = accounts.map((a) => {
    const balance = Number(a.balance)
    return {
      code: a.code,
      name: a.name,
      type: a.type,
      group: parseInt(a.code.charAt(0), 10),
      debit: balance > 0 ? balance : 0,
      credit: balance < 0 ? Math.abs(balance) : 0,
      balance,
    }
  })

  const totalDebit = rows.reduce((s, r) => s + r.debit, 0)
  const totalCredit = rows.reduce((s, r) => s + r.credit, 0)

  return { rows, totalDebit, totalCredit }
}
