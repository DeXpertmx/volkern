const { EntryManager } = require('../lib/accounting/entry-manager');
const { AccountingInitializer } = require('../lib/accounting/initializer');
const { prisma } = require('../lib/db');

async function test() {
  const tenantId = 'cmo09jrkc0000mf0ebul7xe9q'; // Demo tenant

  console.log('--- Phase 1: Initializing Chart of Accounts ---');
  await AccountingInitializer.initializeTenant(tenantId);
  
  const accounts = await prisma.accountingAccount.findMany({ where: { tenantId } });
  const map = {};
  accounts.forEach(a => map[a.code] = a.id);

  console.log('--- Phase 2: Creating Test Entry ---');
  // Simple Sale: 121 EUR (100 base + 21 VAT)
  try {
    const entry = await EntryManager.createEntry({
      tenantId,
      description: 'Venta de servicio demo #001',
      lines: [
        { accountId: map['430'], debit: 121, credit: 0 },   // Clientes (Activo aumenta)
        { accountId: map['705'], debit: 0, credit: 100 },  // Ventas (Ingreso aumenta)
        { accountId: map['477'], debit: 0, credit: 21 }    // IVA Repercutido (Pasivo aumenta)
      ]
    });
    console.log('Entry Created:', entry.id, 'Hash:', entry.entryHash);
    
    console.log('--- Phase 3: Verifying Integrity ---');
    const integrity = await EntryManager.verifyLedgerIntegrity(tenantId);
    console.log('Ledger Integrity:', integrity.isValid ? 'OK ✅' : 'FAIL ❌');
    
    if (!integrity.isValid) {
      console.log('Breaches:', integrity.breaches);
    }
  } catch (err) {
    console.error('Error:', err.message);
  }
}

test().then(() => process.exit(0));
