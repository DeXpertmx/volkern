import { prisma } from '@/lib/db';
import { createHash } from 'crypto';
import { EntryManager } from './entry-manager';

export class IntegrityService {
  /**
   * Closes an accounting period and seals it.
   */
  static async closePeriod(tenantId: string, year: number, month: number) {
    // 1. Verify period is not already closed
    const existing = await prisma.accountingPeriod.findUnique({
      where: { tenantId_year_month: { tenantId, year, month } }
    });

    if (existing?.isClosed) throw new Error('El periodo ya está cerrado y sellado.');

    // 2. Perform a full integrity check before closing
    const integrity = await EntryManager.verifyLedgerIntegrity(tenantId);
    if (!integrity.isValid) {
      throw new Error(`No se puede cerrar el periodo: Se detectaron brechas de integridad en el libro diario.`);
    }

    // 3. Generate snapshot hash of all entries in the period
    const entries = await prisma.accountingEntry.findMany({
      where: {
        tenantId,
        date: {
          gte: new Date(year, month - 1, 1),
          lt: new Date(year, month, 1)
        }
      },
      orderBy: { date: 'asc' }
    });

    const snapshotData = JSON.stringify(entries.map(e => ({ id: e.id, hash: e.entryHash })));
    const closingHash = createHash('sha256').update(snapshotData).digest('hex');

    // 4. Create/Update period record
    return await prisma.accountingPeriod.upsert({
      where: { tenantId_year_month: { tenantId, year, month } },
      update: {
        isClosed: true,
        closedAt: new Date(),
        closingHash
      },
      create: {
        tenantId,
        year,
        month,
        isClosed: true,
        closedAt: new Date(),
        closingHash
      }
    });
  }

  /**
   * Middleware-like check to prevent modifications to closed periods.
   */
  static async isPeriodLocked(tenantId: string, date: Date) {
    const year = date.getFullYear();
    const month = date.getMonth() + 1;

    const period = await prisma.accountingPeriod.findUnique({
      where: { tenantId_year_month: { tenantId, year, month } }
    });

    return period?.isClosed || false;
  }
}
