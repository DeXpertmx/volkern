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

const ACTIVO_SECTIONS: { label: string; groupFilter: (g: number) => boolean }[] = [
  { label: 'A) Activo No Corriente', groupFilter: (g) => g === 2 },
  { label: 'B) Activo Corriente', groupFilter: (g) => g === 3 || g === 4 || g === 5 },
]

const PASIVO_SECTIONS: { label: string; groupFilter: (g: number) => boolean }[] = [
  { label: 'A) Patrimonio Neto', groupFilter: (g) => g === 1 },
  { label: 'B) Pasivo No Corriente', groupFilter: (g) => false },
  { label: 'C) Pasivo Corriente', groupFilter: (g) => g === 4 || g === 5 },
]

function buildSection(
  accounts: { code: string; name: string; type: string; balance: number; group: number }[],
  typeFilter: string,
  sections: { label: string; groupFilter: (g: number) => boolean }[]
): { sections: BalanceSheetSection[]; total: number } {
  const result: BalanceSheetSection[] = []
  let total = 0

  for (const sec of sections) {
    const accs = accounts
      .filter((a) => a.type === typeFilter && sec.groupFilter(a.group) && a.balance !== 0)
      .map((a) => ({ code: a.code, name: a.name, balance: a.balance }))
      .sort((a, b) => a.code.localeCompare(b.code))

    const sectionTotal = accs.reduce((s, a) => s + a.balance, 0)
    total += sectionTotal
    result.push({ label: sec.label, accounts: accs, total: sectionTotal })
  }

  return { sections: result, total }
}

export async function getBalanceSheet(tenantId: string): Promise<BalanceSheetReport> {
  const accounts = await prisma.accountingAccount.findMany({
    where: { tenantId, type: { in: ['ACTIVO', 'PASIVO'] } },
    orderBy: { group: 'asc' as any, code: 'asc' } as any,
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
