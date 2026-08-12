import { prisma } from '@/lib/db';
import { createHmac } from 'crypto';
import { Decimal } from '@prisma/client/runtime/library';

const ACCOUNTING_SECRET = process.env.ACCOUNTING_SECRET || 'volkern-accounting-default-secret-2026';

export interface EntryLineInput {
  accountId: string;
  debit: number;
  credit: number;
}

export interface TaxImpactInput {
  type: 'IVA_REPERCUTIDO' | 'IVA_SOPORTADO' | 'IRPF_RETENCION';
  baseAmount: number;
  taxRate: number;
  taxAmount: number;
  periodMonth: number;
  periodYear: number;
}

export class EntryManager {
  /**
   * Creates a balanced accounting entry with HMAC hashing.
   */
  static async createEntry(data: {
    tenantId: string;
    description: string;
    reference?: string;
    lines: EntryLineInput[];
    taxImpact?: TaxImpactInput;   // Un solo impacto (compatibilidad)
    taxImpacts?: TaxImpactInput[]; // Varios impactos (p. ej. IVA + IRPF en un gasto)
  }) {
    // 1. Validate balance
    const totalDebit = data.lines.reduce((sum, l) => sum + l.debit, 0);
    const totalCredit = data.lines.reduce((sum, l) => sum + l.credit, 0);

    if (Math.abs(totalDebit - totalCredit) > 0.001) {
      throw new Error(`Asiento desbalanceado: Debe (${totalDebit}) != Haber (${totalCredit})`);
    }

    // 2. Get previous entry hash for chaining
    const lastEntry = await prisma.accountingEntry.findFirst({
      where: { tenantId: data.tenantId },
      orderBy: { date: 'desc' },
      select: { entryHash: true }
    });

    const previousHash = lastEntry?.entryHash || 'GENESIS';

    // 3. Prepare entry hash (ordenar una copia: NO mutar el array original,
    //    para que las líneas se persistan en el orden en que se reciben)
    const entryData = JSON.stringify({
      tenantId: data.tenantId,
      description: data.description,
      lines: [...data.lines].sort((a, b) => a.accountId.localeCompare(b.accountId)),
      previousHash
    });

    const entryHash = createHmac('sha256', ACCOUNTING_SECRET)
      .update(entryData)
      .digest('hex');

    // 4. Persistence in transaction
    return await prisma.$transaction(async (tx) => {
      // Impactos fiscales: soporta uno o varios (p. ej. IVA soportado + IRPF)
      const impacts: TaxImpactInput[] =
        data.taxImpacts ?? (data.taxImpact ? [data.taxImpact] : []);

      // Create Entry
      const entry = await tx.accountingEntry.create({
        data: {
          tenantId: data.tenantId,
          description: data.description,
          reference: data.reference,
          previousHash,
          entryHash,
          lines: {
            create: data.lines.map(l => ({
              accountId: l.accountId,
              debit: l.debit,
              credit: l.credit
            }))
          },
          taxImpact: impacts.length > 0 ? {
            create: impacts.map(i => ({
              tenantId: data.tenantId,
              type: i.type as any,
              baseAmount: i.baseAmount,
              taxRate: i.taxRate,
              taxAmount: i.taxAmount,
              periodMonth: i.periodMonth,
              periodYear: i.periodYear
            }))
          } : undefined
        },
        include: { lines: true, taxImpact: true }
      });

      // Update Account balances (Operational denormalization for faster reporting)
      for (const line of data.lines) {
        await tx.accountingAccount.update({
          where: { id: line.accountId },
          data: {
            balance: {
              increment: line.debit - line.credit
            }
          }
        });
      }

      return entry;
    });
  }

  /**
   * Verifies the integrity of the ledger for a tenant.
   */
  static async verifyLedgerIntegrity(tenantId: string) {
    const entries = await prisma.accountingEntry.findMany({
      where: { tenantId },
      orderBy: { date: 'asc' },
      include: { lines: true }
    });

    let expectedPrevHash = 'GENESIS';
    const breaches = [];

    for (const entry of entries) {
      // Verify previous hash link
      if (entry.previousHash !== expectedPrevHash) {
        breaches.push({ entryId: entry.id, reason: 'Broken Chain: previousHash mismatch' });
      }

      // Re-calculate hash
      const entryLines = entry.lines.map(l => ({
        accountId: l.accountId,
        debit: Number(l.debit),
        credit: Number(l.credit)
      })).sort((a, b) => a.accountId.localeCompare(b.accountId));

      const entryData = JSON.stringify({
        tenantId: entry.tenantId,
        description: entry.description,
        lines: entryLines,
        previousHash: entry.previousHash
      });

      const calculatedHash = createHmac('sha256', ACCOUNTING_SECRET)
        .update(entryData)
        .digest('hex');

      if (entry.entryHash !== calculatedHash) {
        breaches.push({ entryId: entry.id, reason: 'Tampered Content: entryHash mismatch' });
      }

      expectedPrevHash = entry.entryHash;
    }

    return {
      isValid: breaches.length === 0,
      breaches
    };
  }
}
