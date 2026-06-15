import { PgcMapping } from './import-types'
import { prisma } from '@/lib/db'

export async function mapAccount(
  tenantId: string,
  sourceCode: string,
  sourceName: string
): Promise<PgcMapping> {
  const code = sourceCode.replace(/[^0-9]/g, '').substring(0, 6)

  const exact = await prisma.accountingAccount.findFirst({
    where: { tenantId, code },
  })

  if (exact) {
    return {
      sourceCode,
      sourceName,
      targetCode: exact.code,
      targetName: exact.name,
      confidence: 1.0,
    }
  }

  const groupCode = code.substring(0, 1)
  const group = await prisma.accountingAccount.findFirst({
    where: { tenantId, code: { startsWith: groupCode } },
    orderBy: { code: 'asc' },
  })

  if (group) {
    const existing = await prisma.accountingAccount.findFirst({
      where: { tenantId, code: sourceCode },
    })
    if (!existing) {
      await prisma.accountingAccount.create({
        data: {
          tenantId,
          code: sourceCode,
          name: sourceName || `${group.name} - ${sourceCode}`,
          type: group.type,
          balance: 0,
        },
      })
      console.log(`[PGCMapper] Created subaccount ${sourceCode} under group ${groupCode}`)
    }

    return {
      sourceCode,
      sourceName,
      targetCode: sourceCode,
      targetName: sourceName || group.name,
      confidence: 0.7,
    }
  }

  return {
    sourceCode,
    sourceName,
    targetCode: code,
    targetName: sourceName,
    confidence: 0.3,
  }
}

export async function mapAccountsBatch(
  tenantId: string,
  accounts: { code: string; name: string; type?: string }[]
): Promise<PgcMapping[]> {
  const results: PgcMapping[] = []
  for (const acc of accounts) {
    const mapping = await mapAccount(tenantId, acc.code, acc.name)
    results.push(mapping)
    if (acc.type) {
      await prisma.accountingAccount.upsert({
        where: { tenantId_code: { tenantId, code: mapping.targetCode } },
        update: { type: acc.type as any },
        create: {
          tenantId,
          code: mapping.targetCode,
          name: acc.name,
          type: acc.type as any,
          balance: 0,
        },
      })
    }
  }
  return results
}
