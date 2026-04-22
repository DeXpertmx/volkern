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
    taxImpact?: TaxImpactInput;
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

    // 3. Prepare entry hash
    const entryData = JSON.stringify({
      tenantId: data.tenantId,
      description: data.description,
      lines: data.lines.sort((a, b) => a.accountId.localeCompare(b.accountId)),
      previousHash
    });

    const entryHash = createHmac('sha256', ACCOUNTING_SECRET)
      .update(entryData)
      .digest('hex');

    // 4. Persistence in transaction
    return await prisma.$transaction(async (tx) => {
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
          taxImpact: data.taxImpact ? {
            create: {
              tenantId: data.tenantId,
              type: data.taxImpact.type as any,
              baseAmount: data.taxImpact.baseAmount,
              taxRate: data.taxImpact.taxRate,
              taxAmount: data.taxImpact.taxAmount,
              periodMonth: data.taxImpact.periodMonth,
              periodYear: data.taxImpact.periodYear
            }
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
