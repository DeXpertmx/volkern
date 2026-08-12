import { prisma } from '@/lib/db'

interface BalanceSheetSection {
  label: string
  accounts: { code: string; name: string; balance: number }[]
  total: number
}

interface BalanceSheetReport {
  activo: { sections: BalanceSheetSection[]; total: number }
  pasivo: { sections: BalanceSheetSection[]; total: number }
}

type SectionFilter = (a: { code: string; group: number }) => boolean

const ACTIVO_SECTIONS: { label: string; filter: SectionFilter }[] = [
  { label: 'A) Activo No Corriente', filter: (a) => a.group === 2 },
  { label: 'B) Activo Corriente', filter: (a) => a.group === 3 || a.group === 4 || a.group === 5 },
]

const PASIVO_SECTIONS: { label: string; filter: SectionFilter }[] = [
  // Grupo 1, cuentas de patrimonio neto (capital, reservas, resultados…)
  { label: 'A) Patrimonio Neto', filter: (a) => a.group === 1 && parseInt(a.code.slice(0, 3), 10) < 140 },
  // Grupo 1, provisiones y deudas a largo plazo (160+)
  { label: 'B) Pasivo No Corriente', filter: (a) => a.group === 1 && parseInt(a.code.slice(0, 3), 10) >= 140 },
  { label: 'C) Pasivo Corriente', filter: (a) => a.group === 4 || a.group === 5 },
]

function buildSection(
  accounts: { code: string; name: string; type: string; balance: number; group: number }[],
  typeFilter: string,
  sections: { label: string; filter: SectionFilter }[]
): { sections: BalanceSheetSection[]; total: number } {
  const result: BalanceSheetSection[] = []
  let total = 0

  for (const sec of sections) {
    const accs = accounts
      .filter((a) => a.type === typeFilter && sec.filter(a) && a.balance !== 0)
      // Valor absoluto: las cuentas de HABER (pasivo/patrimonio) tienen saldo
      // negativo por convención interna; en el balance se muestran en positivo
      .map((a) => ({ code: a.code, name: a.name, balance: Math.abs(a.balance) }))
      .sort((a, b) => a.code.localeCompare(b.code))

    const sectionTotal = Math.round(accs.reduce((s, a) => s + a.balance, 0) * 100) / 100
    total += sectionTotal
    result.push({ label: sec.label, accounts: accs, total: sectionTotal })
  }

  return { sections: result, total: Math.round(total * 100) / 100 }
}

export async function getBalanceSheet(tenantId: string): Promise<BalanceSheetReport> {
  const accounts = await prisma.accountingAccount.findMany({
    where: { tenantId, type: { in: ['ACTIVO', 'PASIVO'] } },
    orderBy: { code: 'asc' },
  })

  const accountsWithGroup = accounts.map((a) => ({
    ...a,
    balance: Number(a.balance),
    group: parseInt(a.code.charAt(0), 10),
  }))

  return {
    activo: buildSection(accountsWithGroup, 'ACTIVO', ACTIVO_SECTIONS),
    pasivo: buildSection(accountsWithGroup, 'PASIVO', PASIVO_SECTIONS),
  }
}
