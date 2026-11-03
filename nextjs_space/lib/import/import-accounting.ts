import { prisma } from '@/lib/db'
import { ImportRow, ImportResult, ColumnMap } from './import-types'
import { mapAccount } from './pgc-mapper'

export async function importOpeningBalances(
  tenantId: string,
  rows: ImportRow[],
  columnMap: ColumnMap[],
  fiscalYear?: number
): Promise<ImportResult> {
  const imported: string[] = []
  const errors: { row: number; field: string; message: string }[] = []

  const map = new Map(columnMap.map(m => [m.targetField, m.sourceField]))
  const year = fiscalYear || new Date().getFullYear()
  const openingDate = new Date(year, 0, 1)
  const entryIds: string[] = []

  const lines: { accountId: string; debit: number; credit: number }[] = []

  for (const row of rows) {
    try {
      const sourceCode = getField(row.data, map, 'cuenta')
      const sourceName = getField(row.data, map, 'nombre_cuenta') || ''
      const saldoStr = getField(row.data, map, 'saldo') || '0'
      const tipo = (getField(row.data, map, 'tipo') || 'deudor').toLowerCase()

      if (!sourceCode) {
        errors.push({ row: row.rowNumber, field: 'cuenta', message: 'Código de cuenta requerido' })
        continue
      }

      const saldo = parseFloat(saldoStr.replace(',', '.'))
      if (isNaN(saldo) || saldo === 0) continue

      const mapping = await mapAccount(tenantId, sourceCode, sourceName)
      const isDeudor = tipo.includes('deudor') || saldo > 0
      const isAcreedor = tipo.includes('acreedor') || saldo < 0

      const absSaldo = Math.abs(saldo)

      if (isAcreedor) {
        lines.push({ accountId: mapping.targetCode, debit: 0, credit: absSaldo })
      } else {
        lines.push({ accountId: mapping.targetCode, debit: absSaldo, credit: 0 })
      }

      imported.push(mapping.targetCode)
    } catch (err) {
      errors.push({
        row: row.rowNumber,
        field: 'general',
        message: err instanceof Error ? err.message : 'Error',
      })
    }
  }

  if (lines.length > 0 && lines.reduce((s, l) => s + l.debit - l.credit, 0) !== 0) {
    const diff = lines.reduce((s, l) => s + l.debit - l.credit, 0)
    const balanceAccount = await prisma.accountingAccount.findFirst({
      where: { tenantId, code: '120' },
    })
    if (balanceAccount) {
      if (diff > 0) {
        lines.push({ accountId: '120', debit: 0, credit: diff })
      } else {
        lines.push({ accountId: '120', debit: Math.abs(diff), credit: 0 })
      }
    }
  }

  if (lines.length > 0) {
    const accountIds = await resolveAccountIds(tenantId, lines)
    const description = `Asiento de apertura ${year}`

    const previousEntry = await prisma.accountingEntry.findFirst({
      where: { tenantId },
      orderBy: { date: 'desc' },
      select: { entryHash: true },
    })

    const entryData = {
      tenantId,
      date: openingDate,
      description,
      status: 'POSTED' as const,
      previousHash: previousEntry?.entryHash || null,
      lines: {
        create: accountIds.map(l => ({
          accountId: l.accountId,
          debit: l.debit,
          credit: l.credit,
        })),
      },
    }

    const { createHash } = await import('./hash-utils')
    const hash = createHash(entryData, previousEntry?.entryHash || null)

    const entry = await prisma.accountingEntry.create({
      data: {
        ...entryData,
        entryHash: hash,
      },
      select: { id: true },
    })
    entryIds.push(entry.id)
  }

  return {
    success: errors.length === 0,
    imported: imported.length,
    failed: errors.length,
    total: rows.length,
    errors,
    meta: { entryIds },
  }
}

export async function importJournalEntries(
  tenantId: string,
  rows: ImportRow[],
  columnMap: ColumnMap[]
): Promise<ImportResult> {
  const errors: { row: number; field: string; message: string }[] = []
  const map = new Map(columnMap.map(m => [m.targetField, m.sourceField]))
  let imported = 0

  const entryGroups = groupRowsByDate(rows, map)
  const entryIds: string[] = []

  for (const [key, groupRows] of Object.entries(entryGroups)) {
    try {
      const lines: { accountId: string; debit: number; credit: number }[] = []
      let totalDebit = 0
      let totalCredit = 0

      for (const row of groupRows) {
        const sourceCode = getField(row.data, map, 'cuenta')
        const sourceName = getField(row.data, map, 'nombre_cuenta') || ''
        const debeStr = (getField(row.data, map, 'debe') || '0').replace(',', '.')
        const haberStr = (getField(row.data, map, 'haber') || '0').replace(',', '.')
        const importeStr = (getField(row.data, map, 'importe') || '0').replace(',', '.')

        if (!sourceCode) {
          errors.push({ row: row.rowNumber, field: 'cuenta', message: 'Cuenta requerida' })
          continue
        }

        let debit = parseFloat(debeStr)
        let credit = parseFloat(haberStr)

        if (debit === 0 && credit === 0) {
          const amount = parseFloat(importeStr)
          if (amount > 0) {
            debit = amount
          } else if (amount < 0) {
            credit = Math.abs(amount)
          }
        }

        if (debit === 0 && credit === 0) continue

        const mapping = await mapAccount(tenantId, sourceCode, sourceName)
        lines.push({ accountId: mapping.targetCode, debit, credit })
        totalDebit += debit
        totalCredit += credit
      }

      if (lines.length === 0) {
        errors.push({ row: groupRows[0].rowNumber, field: 'general', message: 'Sin líneas válidas' })
        continue
      }

      const firstRow = groupRows[0]
      const fechaStr = getField(firstRow.data, map, 'fecha') || new Date().toISOString().split('T')[0]
      const concepto = getField(firstRow.data, map, 'concepto') || `Importación ${new Date().toISOString().split('T')[0]}`
      const documento = getField(firstRow.data, map, 'documento') || ''

      const accountIds = await resolveAccountIds(tenantId, lines)
      const previousEntry = await prisma.accountingEntry.findFirst({
        where: { tenantId },
        orderBy: { date: 'desc' },
        select: { entryHash: true },
      })

      const entryData = {
        tenantId,
        date: new Date(fechaStr),
        description: concepto,
        reference: documento,
        status: 'POSTED' as const,
        previousHash: previousEntry?.entryHash || null,
        lines: {
          create: accountIds.map(l => ({
            accountId: l.accountId,
            debit: l.debit,
            credit: l.credit,
          })),
        },
      }

      const { createHash } = await import('./hash-utils')
      const hash = createHash(entryData, previousEntry?.entryHash || null)

      const entry = await prisma.accountingEntry.create({
        data: { ...entryData, entryHash: hash },
        select: { id: true },
      })
      entryIds.push(entry.id)

      imported++
    } catch (err) {
      errors.push({
        row: groupRows[0].rowNumber,
        field: 'general',
        message: err instanceof Error ? err.message : 'Error',
      })
    }
  }

  return {
    success: errors.length === 0,
    imported,
    failed: errors.length,
    total: rows.length,
    errors,
    meta: { entryIds },
  }
}

function groupRowsByDate(rows: ImportRow[], map: Map<string, string>): Record<string, ImportRow[]> {
  const groups: Record<string, ImportRow[]> = {}
  for (const row of rows) {
    const fecha = getField(row.data, map, 'fecha') || 'unknown'
    if (!groups[fecha]) groups[fecha] = []
    groups[fecha].push(row)
  }
  return groups
}

async function resolveAccountIds(
  tenantId: string,
  lines: { accountId: string; debit: number; credit: number }[]
): Promise<{ accountId: string; debit: number; credit: number }[]> {
  const accounts = await prisma.accountingAccount.findMany({
    where: { tenantId, code: { in: lines.map(l => l.accountId) } },
    select: { id: true, code: true },
  })
  const accountMap = new Map(accounts.map(a => [a.code, a.id]))

  return lines.map(l => ({
    accountId: accountMap.get(l.accountId) || l.accountId,
    debit: l.debit,
    credit: l.credit,
  }))
}

function getField(data: Record<string, string>, map: Map<string, string>, targetField: string): string | undefined {
  const sourceField = map.get(targetField)
  if (!sourceField || sourceField === '__skip__') return undefined
  return data[sourceField]?.trim() || undefined
}
