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

const GASTO_GROUPS: { label: string; groupFilter: (g: number) => boolean }[] = [
  { label: '1. Consumos y Aprovisionamientos', groupFilter: (g) => g === 6 && false },
  { label: '2. Gastos de Personal', groupFilter: (g) => false },
  { label: '3. Dotaciones Amortización', groupFilter: (g) => false },
  { label: '4. Otros Gastos Explotación', groupFilter: (g) => false },
  { label: '5. Gastos Financieros', groupFilter: (g) => false },
]

const INGRESO_GROUPS: { label: string; groupFilter: (g: number) => boolean }[] = [
  { label: '1. Ingresos de Explotación', groupFilter: (g) => false },
  { label: '2. Ingresos Financieros', groupFilter: (g) => false },
  { label: '3. Otros Ingresos', groupFilter: (g) => false },
]

export async function getPyG(tenantId: string): Promise<PyGReport> {
  const accounts = await prisma.accountingAccount.findMany({
    where: { tenantId, type: { in: ['GASTO', 'INGRESO'] } },
    orderBy: [{ group: 'asc' }, { code: 'asc' }],
  })

  const gastos = accounts.filter((a) => a.type === 'GASTO' && Number(a.balance) !== 0)
  const ingresos = accounts.filter((a) => a.type === 'INGRESO' && Number(a.balance) !== 0)

  const totalGastos = gastos.reduce((s, a) => s + Number(a.balance), 0)
  const totalIngresos = ingresos.reduce((s, a) => s + Number(a.balance), 0)

  const sections: PyGSection[] = [
    {
      label: '1. Gastos de Explotación',
      accounts: gastos
        .filter((a) => {
          const group = parseInt(a.code.charAt(0), 10)
          return group === 6
        })
        .map((a) => ({ code: a.code, name: a.name, balance: Number(a.balance) }))
        .sort((a, b) => a.code.localeCompare(b.code)),
      total: 0,
    },
    {
      label: '2. Ingresos de Explotación',
      accounts: ingresos
        .filter((a) => {
          const group = parseInt(a.code.charAt(0), 10)
          return group === 7
        })
        .map((a) => ({ code: a.code, name: a.name, balance: Number(a.balance) }))
        .sort((a, b) => a.code.localeCompare(b.code)),
      total: 0,
    },
  ]

  sections[0].total = sections[0].accounts.reduce((s, a) => s + a.balance, 0)
  sections[1].total = sections[1].accounts.reduce((s, a) => s + a.balance, 0)

  const resultadoEjercicio = totalIngresos - totalGastos

  return { sections, totalGastos, totalIngresos, resultadoEjercicio }
}
