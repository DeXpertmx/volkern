import { prisma } from '@/lib/db';
import { getPlanAccounts, type PgcPlan, type SectorAdaptation } from './plans/catalog';

function mapType(t: 'ACTIVO' | 'PASIVO' | 'GASTO' | 'INGRESO'): string {
  return t;
}

export class AccountingInitializer {
  static async initializeTenant(
    tenantId: string,
    planType: PgcPlan = 'NORMAL',
    sector: SectorAdaptation = 'NINGUNO',
  ) {
    console.log(`[Accounting] Initializing ${planType} Chart of Accounts for tenant: ${tenantId} (sector: ${sector})`);

    const accounts = getPlanAccounts(planType, sector);

    const ops = accounts.map(acc =>
      prisma.accountingAccount.upsert({
        where: {
          tenantId_code: { tenantId, code: acc.code },
        },
        update: { name: acc.name, type: mapType(acc.type) },
        create: {
          tenantId,
          code: acc.code,
          name: acc.name,
          type: mapType(acc.type),
        },
      }),
    );

    await prisma.$transaction(ops);
    console.log(`[Accounting] Created ${accounts.length} accounts for tenant ${tenantId}`);
    return true;
  }

  static async reinitializeTenant(
    tenantId: string,
    planType: PgcPlan = 'NORMAL',
    sector: SectorAdaptation = 'NINGUNO',
  ) {
    console.log(`[Accounting] Re-initializing ${planType} Chart of Accounts for tenant: ${tenantId}`);

    const accounts = getPlanAccounts(planType, sector);
    const existing = await prisma.accountingAccount.findMany({
      where: { tenantId },
      select: { code: true },
    });
    const existingCodes = new Set(existing.map(a => a.code));
    const newCodes = new Set(accounts.map(a => a.code));

    const toAdd = accounts.filter(a => !existingCodes.has(a.code));
    const toRemoveCodes = [...existingCodes].filter(c => !newCodes.has(c));

    if (toRemoveCodes.length > 0) {
      await prisma.accountingAccount.deleteMany({
        where: { tenantId, code: { in: toRemoveCodes } },
      });
      console.log(`[Accounting] Removed ${toRemoveCodes.length} accounts not in ${planType}`);
    }

    if (toAdd.length > 0) {
      const ops = toAdd.map(acc =>
        prisma.accountingAccount.create({
          data: { tenantId, code: acc.code, name: acc.name, type: mapType(acc.type) },
        }),
      );
      await prisma.$transaction(ops);
      console.log(`[Accounting] Added ${toAdd.length} new accounts for ${planType}`);
    }

    console.log(`[Accounting] Total accounts: ${accounts.length}`);
    return true;
  }
}
