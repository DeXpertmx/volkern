/**
 * Backfill: contabiliza los gastos existentes que quedaron sin asiento porque
 * el listener contable no estaba activo en producción.
 *
 * Pasos por tenant con gastos:
 *  1. Inicializa el plan contable (AccountingInitializer.initializeTenant) si
 *     el tenant no tiene cuentas (necesarias para 472/410/4751/...).
 *  2. Para cada gasto sin asiento, llama AccountingEventMapper.mapExpenseToEntry
 *     (idempotente: comprueba reference antes de crear).
 *
 * Uso: DATABASE_URL=... npx tsx scripts/backfill-expense-ledger.ts [tenantNombre]
 */
import { prisma } from '../lib/db';
import { AccountingInitializer } from '../lib/accounting/initializer';
import { AccountingEventMapper } from '../lib/accounting/event-mapper';

async function main() {
  const filterName = process.argv[2];
  const tenants = await prisma.tenant.findMany({ select: { id: true, nombre: true, moneda: true } });
  let processedTenants = 0;

  for (const tenant of tenants) {
    if (filterName && !tenant.nombre.toLowerCase().includes(filterName.toLowerCase())) continue;
    const gastos = await prisma.expense.count({ where: { tenantId: tenant.id } });
    if (gastos === 0) continue;

    console.log(`\n=== ${tenant.nombre} (${tenant.moneda}) — ${gastos} gastos ===`);

    // 1. Plan contable
    const cuentas = await prisma.accountingAccount.count({ where: { tenantId: tenant.id } });
    if (cuentas === 0) {
      try {
        await AccountingInitializer.initializeTenant(tenant.id, 'NORMAL', 'NINGUNO');
        console.log('  ✓ Plan contable inicializado (NORMAL)');
      } catch (e: any) {
        console.log(`  ✗ Error inicializando plan contable: ${e.message}`);
        continue;
      }
    } else {
      console.log(`  ✓ Plan contable ya existía (${cuentas} cuentas)`);
    }

    // 2. Asientos pendientes
    const expenses = await prisma.expense.findMany({
      where: { tenantId: tenant.id },
      select: { id: true, description: true },
      orderBy: { createdAt: 'asc' },
    });
    const existingRefs = new Set(
      (await prisma.accountingEntry.findMany({ where: { tenantId: tenant.id }, select: { reference: true } })).map(e => e.reference),
    );
    const pendientes = expenses.filter(e => !existingRefs.has(e.id));
    console.log(`  Asientos existentes: ${existingRefs.size} · Pendientes: ${pendientes.length}`);

    let ok = 0, err = 0;
    for (const exp of pendientes) {
      try {
        await AccountingEventMapper.mapExpenseToEntry(exp.id);
        ok++;
      } catch (e: any) {
        err++;
        console.log(`  ✗ ${exp.description.slice(0, 60)}: ${e.message}`);
      }
    }
    console.log(`  ✓ Contabilizados: ${ok} · Errores: ${err}`);
    processedTenants++;
  }

  await prisma.$disconnect();
  console.log(`\nListo. Tenants procesados: ${processedTenants}`);
}

main().catch(e => { console.error(e); process.exit(1); });
