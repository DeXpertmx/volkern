import { prisma } from '@/lib/db'

interface PyGSection {
  label: string
  accounts: { code: string; name: string; balance: number }[]
  total: number
}

interface PyGReport {
  sections: PyGSection[]
  totalGastos: number
  totalIngresos: number
  resultadoEjercicio: number
}

/**
 * Cuenta de Resultados (PyG).
 *
 * Convención de signos del EntryManager: balance = Σ(debe − haber), así que
 * las cuentas de INGRESO (grupo 7) tienen saldo NEGATIVO (columna de haber).
 * Aquí se reportan en positivo (valor absoluto) para que ingresos, gastos y
 * resultado tengan el signo esperado por el usuario.
 */
export async function getPyG(tenantId: string): Promise<PyGReport> {
  const accounts = await prisma.accountingAccount.findMany({
    where: { tenantId, type: { in: ['GASTO', 'INGRESO'] } },
    orderBy: { code: 'asc' },
  })

  const gastos = accounts
    .filter((a) => a.type === 'GASTO' && Number(a.balance) !== 0)
    .map((a) => ({ code: a.code, name: a.name, balance: Math.abs(Number(a.balance)) }))
    .sort((a, b) => a.code.localeCompare(b.code))

  const ingresos = accounts
    .filter((a) => a.type === 'INGRESO' && Number(a.balance) !== 0)
    .map((a) => ({ code: a.code, name: a.name, balance: Math.abs(Number(a.balance)) }))
    .sort((a, b) => a.code.localeCompare(b.code))

  const totalGastos = Math.round(gastos.reduce((s, a) => s + a.balance, 0) * 100) / 100
  const totalIngresos = Math.round(ingresos.reduce((s, a) => s + a.balance, 0) * 100) / 100

  const sections: PyGSection[] = [
    {
      label: '1. Gastos de Explotación',
      accounts: gastos.filter((a) => a.code.startsWith('6')),
      total: 0,
    },
    {
      label: '2. Ingresos de Explotación',
      accounts: ingresos.filter((a) => a.code.startsWith('7')),
      total: 0,
    },
  ]

  sections[0].total = Math.round(sections[0].accounts.reduce((s, a) => s + a.balance, 0) * 100) / 100
  sections[1].total = Math.round(sections[1].accounts.reduce((s, a) => s + a.balance, 0) * 100) / 100

  const resultadoEjercicio = Math.round((totalIngresos - totalGastos) * 100) / 100

  return { sections, totalGastos, totalIngresos, resultadoEjercicio }
}
