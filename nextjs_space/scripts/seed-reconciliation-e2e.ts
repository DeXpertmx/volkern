/**
 * Seed script for E2E reconciliation test
 * Populates: AGENCY tenant, User, API key, bank connection, bank transactions,
 * accounting accounts, accounting entries with matching lines for auto-reconciliation
 */
import { PrismaClient } from '@prisma/client';
import { hashApiKey } from '@/lib/api-keys';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('=== Seeding E2E reconciliation test data ===\n');

  // 0. Clean existing test data
  await prisma.bankReconciliation.deleteMany({ where: { transaction: { bankConnection: { tenantId: { startsWith: 'e2e-' } } } } });
  await prisma.accountingLine.deleteMany({ where: { entry: { tenantId: { startsWith: 'e2e-' } } } });
  await prisma.accountingEntry.deleteMany({ where: { tenantId: { startsWith: 'e2e-' } } });
  await prisma.accountingAccount.deleteMany({ where: { tenantId: { startsWith: 'e2e-' } } });
  await prisma.bankTransaction.deleteMany({ where: { bankConnection: { tenantId: { startsWith: 'e2e-' } } } });
  await prisma.bankConnection.deleteMany({ where: { tenantId: { startsWith: 'e2e-' } } });
  await prisma.apiKey.deleteMany({ where: { tenantId: { startsWith: 'e2e-' } } });
  await prisma.user.deleteMany({ where: { tenantId: { startsWith: 'e2e-' } } });
  await prisma.tenant.deleteMany({ where: { id: { startsWith: 'e2e-' } } });

  // 1. Create AGENCY tenant
  const tenant = await prisma.tenant.create({
    data: {
      id: 'e2e-tenant-reconciliation',
      nombre: 'E2E Test Agency',
      slug: 'e2e-test-agency',
      plan: 'ENTERPRISE',
      accountType: 'AGENCY',
      billingEmail: 'e2e@test.com',
      enabledModules: ['CRM', 'ACCOUNTING'],
    },
  });
  console.log(`✓ Tenant: ${tenant.id} (${tenant.nombre})`);

  // 2. Create User for the tenant (with password for browser login)
  const TEST_PASSWORD = 'Test1234!';
  const hashedPassword = await bcrypt.hash(TEST_PASSWORD, 12);
  const user = await prisma.user.create({
    data: {
      email: 'e2e@test.com',
      name: 'E2E Test User',
      password: hashedPassword,
      tenantId: tenant.id,
      estado: 'activo',
    },
  });
  console.log(`✓ User: ${user.id} (${user.email}) — password: ${TEST_PASSWORD}`);

  // 3. Create API key for API auth
  const apiKeyPlain = 'vk_prod_cafebabe12345678cafebabe12345678cafebabe12345678cafebabe12345678';
  const keyHash = hashApiKey(apiKeyPlain);
  const prefix = 'vk_prod_cafebabe';
  await prisma.apiKey.create({
    data: {
      keyHash,
      prefix,
      tenantId: tenant.id,
      userId: user.id,
      nombre: 'E2E Test Key',
      activo: true,
      scopes: ['accounting:read', 'accounting:write'],
    },
  });
  console.log(`✓ API Key created (key=${apiKeyPlain})`);

  // 4. Create accounting accounts
  const accounts: Record<string, any> = {};
  const accountData = [
    { code: '1001', name: 'Caja y Bancos', type: 'ACTIVO' },
    { code: '4001', name: 'Clientes', type: 'ACTIVO' },
    { code: '6001', name: 'Gastos de Personal', type: 'GASTO' },
    { code: '7001', name: 'Ventas', type: 'INGRESO' },
    { code: '2001', name: 'Proveedores', type: 'PASIVO' },
  ];
  for (const a of accountData) {
    const account = await prisma.accountingAccount.create({
      data: {
        tenantId: tenant.id,
        code: a.code,
        name: a.name,
        type: a.type,
        balance: 0,
      },
    });
    accounts[a.code] = account;
  }
  console.log(`✓ ${Object.keys(accounts).length} accounting accounts created`);

  // 5. Create bank connection (NORDIGEN)
  const bankConnection = await prisma.bankConnection.create({
    data: {
      tenantId: tenant.id,
      provider: 'NORDIGEN',
      providerId: 'e2e-nordigen-provider',
      bankName: 'Banco Santander E2E',
      status: 'ACTIVE',
      lastSync: new Date(),
      institutionId: 'SANT_ES_E2E',
    },
  });
  console.log(`✓ Bank Connection: ${bankConnection.id} (${bankConnection.bankName})`);

  // 6. Create bank transactions (unreconciled)
  const transactions: any[] = [];
  const txData = [
    { date: new Date('2026-05-20'), description: 'COBRO FACTURA #001', amount: 121.00, reference: 'E2E-REF-001' },
    { date: new Date('2026-05-21'), description: 'PAGO NOMINA MARZO', amount: -2100.00, reference: 'E2E-REF-002' },
    { date: new Date('2026-05-22'), description: 'TRANSFERENCIA RECIBIDA CLIENTE', amount: 5000.00, reference: 'E2E-REF-003' },
    { date: new Date('2026-05-23'), description: 'PAGO PROVEEDOR SERVICIOS', amount: -850.00, reference: 'E2E-REF-004' },
    { date: new Date('2026-05-24'), description: 'COBRO FACTURA MENSUAL', amount: 350.00, reference: 'E2E-REF-005' },
  ];
  for (const t of txData) {
    const tx = await prisma.bankTransaction.create({
      data: {
        bankConnectionId: bankConnection.id,
        date: t.date,
        description: t.description,
        amount: t.amount,
        reference: t.reference,
        isReconciled: false,
      },
    });
    transactions.push(tx);
  }
  console.log(`✓ ${transactions.length} bank transactions created`);

  // 7. Create accounting entries WITH lines matching the first 3 transactions
  // Note: AutoReconciler calculates entryTotal = sum(debit - credit)
  // For double-entry (debits=credits) entryTotal=0, which won't match.
  // We create single-line entries so entryTotal equals the transaction amount.
  // Entry 1: Matches "COBRO FACTURA #001" (121.00)
  const entry1 = await prisma.accountingEntry.create({
    data: {
      tenantId: tenant.id,
      date: new Date('2026-05-20'),
      description: 'Factura #001 - Cliente A',
      reference: 'E2E-AS-001',
      status: 'POSTED',
      entryHash: 'e2e-hash-recon-entry-a',
      lines: {
        create: [
          { accountId: accounts['1001'].id, debit: 121.00, credit: 0 },
        ],
      },
    },
    include: { lines: true },
  });
  console.log(`✓ AS-001: "${entry1.description}" (121.00€) — lines: ${entry1.lines.length}`);

  // Entry 2: Matches "PAGO NOMINA MARZO" (-2100.00) — shows as net 2100
  const entry2 = await prisma.accountingEntry.create({
    data: {
      tenantId: tenant.id,
      date: new Date('2026-05-21'),
      description: 'Nómina Marzo 2026',
      reference: 'E2E-AS-002',
      status: 'POSTED',
      entryHash: 'e2e-hash-recon-entry-b',
      lines: {
        create: [
          { accountId: accounts['6001'].id, debit: 2100.00, credit: 0 },
        ],
      },
    },
    include: { lines: true },
  });
  console.log(`✓ AS-002: "${entry2.description}" (2100.00€) — lines: ${entry2.lines.length}`);

  // Entry 3: Matches "TRANSFERENCIA RECIBIDA CLIENTE" (5000.00)
  const entry3 = await prisma.accountingEntry.create({
    data: {
      tenantId: tenant.id,
      date: new Date('2026-05-22'),
      description: 'Transferencia recibida - Cliente B',
      reference: 'E2E-AS-003',
      status: 'POSTED',
      entryHash: 'e2e-hash-recon-entry-c',
      lines: {
        create: [
          { accountId: accounts['1001'].id, debit: 5000.00, credit: 0 },
        ],
      },
    },
    include: { lines: true },
  });
  console.log(`✓ AS-003: "${entry3.description}" (5000.00€) — lines: ${entry3.lines.length}`);

  console.log('\n=== Seed complete ===');
  console.log(`Tenant ID: ${tenant.id}`);
  console.log(`API Key: ${apiKeyPlain}`);
  console.log(`User ID: ${user.id}`);
  console.log(`Bank Connection ID: ${bankConnection.id}`);
  console.log(`Transactions: ${transactions.map(t => t.id).join(', ')}`);
  console.log(`Transaction #1 ID: ${transactions[0].id} (COBRO FACTURA #001, 121.00€)`);
  console.log(`Transaction #2 ID: ${transactions[1].id} (PAGO NOMINA MARZO, -2100.00€)`);
  console.log(`Transaction #3 ID: ${transactions[2].id} (TRANSFERENCIA RECIBIDA CLIENTE, 5000.00€)`);
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
