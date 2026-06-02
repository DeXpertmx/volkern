/**
 * Seed script for E2E tab/URL synchronization test
 *
 * Creates:
 * - AGENCY tenant with a test user (e2e-slots@test.com / Test1234!)
 * - 2 AGENCY_SLOT slots (visible in agency tab)
 * - 2 ACCOUNTING_SLOT slots (visible in accounting tab)
 * - 1 deleted AGENCY_SLOT slot (should not appear in any tab)
 * - API key for API auth
 */
import { PrismaClient } from '@prisma/client';
import { hashApiKey } from '@/lib/api-keys';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// ─── Helpers ────────────────────────────────────────────────────────────────

function generateSlug(base: string): string {
  return base.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/^-+|-+$/g, '');
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== Seeding E2E tab/URL sync test data ===\n');

  const PREFIX = 'e2e-tab-';

  // 0. Clean existing test data
  console.log('Cleaning previous test data...');
  await prisma.tenant.deleteMany({ where: { id: { startsWith: PREFIX } } });
  await prisma.tenant.deleteMany({ where: { parentId: { startsWith: PREFIX } } });
  await prisma.user.deleteMany({ where: { email: 'e2e-slots@test.com' } });
  await prisma.apiKey.deleteMany({ where: { tenantId: { startsWith: PREFIX } } });
  console.log('  ✓ Cleanup complete\n');

  // 1. Create AGENCY tenant (parent)
  const tenant = await prisma.tenant.create({
    data: {
      id: `${PREFIX}agency`,
      nombre: 'E2E Tab Test Agency',
      slug: generateSlug('e2e-tab-agency'),
      plan: 'pro-agency',
      accountType: 'AGENCY',
      maxSlots: 10,
      billingEmail: 'e2e-slots@test.com',
      estado: 'activo',
      enabledModules: ['CRM', 'LEADS', 'ACCOUNTING'],
      brandingConfig: {
        logoUrl: 'https://volkern.com/logo.png',
        showPoweredBy: false,
      },
    },
  });
  console.log(`✓ AGENCY tenant: ${tenant.id} (${tenant.nombre})`);

  // 2. Create test user (for browser login)
  const TEST_PASSWORD = 'Test1234!';
  const hashedPassword = await bcrypt.hash(TEST_PASSWORD, 12);
  const user = await prisma.user.create({
    data: {
      email: 'e2e-slots@test.com',
      name: 'E2E Tab Test User',
      password: hashedPassword,
      tenantId: tenant.id,
      estado: 'activo',
    },
  });
  console.log(`✓ User: ${user.id} (${user.email}) — password: ${TEST_PASSWORD}`);

  // 3. Create API key for API auth
  const apiKeyPlain = 'vk_prod_b4d3eba51e2etabsync1234567890abcdef1234567890abcdef1234567890abcd';
  const keyHash = hashApiKey(apiKeyPlain);
  await prisma.apiKey.create({
    data: {
      keyHash,
      prefix: 'vk_prod_e2e_tab_sync',
      tenantId: tenant.id,
      userId: user.id,
      nombre: 'E2E Tab Sync Key',
      activo: true,
      scopes: ['admin'],
    },
  });
  console.log(`✓ API Key created: ${apiKeyPlain}\n`);

  // 4. Create AGENCY_SLOT slots (2 active + 1 deleted)
  const agencySlots = [
    { id: 'alfa', name: 'Inmobiliaria Alfa', modules: ['CRM', 'LEADS', 'PIPELINE'] },
    { id: 'beta', name: 'Agencia Creativa Beta', modules: ['CRM', 'CONTACTOS', 'CAMPANAS'] },
    { id: 'gamma', name: 'Cliente Eliminado Gamma', modules: ['CRM'], estado: 'eliminado' as const },
  ];

  for (const slotData of agencySlots) {
    const slot = await prisma.tenant.create({
      data: {
        id: `${PREFIX}agency-slot-${slotData.id}`,
        nombre: slotData.name,
        slug: generateSlug(slotData.name),
        parentId: tenant.id,
        accountType: 'BUSINESS',
        plan: 'agency-slot',
        estado: slotData.estado || 'activo',
        enabledModules: slotData.modules,
        billingEmail: slotData.id + '@e2e-tab.local',
        brandingConfig: {},
      },
    });
    const estadoLabel = slot.estado === 'eliminado' ? ' (eliminado)' : '';
    console.log(`  ✓ AGENCY_SLOT: ${slot.nombre}${estadoLabel}`);
  }

  // 5. Create ACCOUNTING_SLOT slots (2 active)
  const accountingSlots = [
    { id: 'sur', name: 'Comercializadora del Sur', modules: ['CONTABILIDAD', 'FACTURACION', 'IMPUESTOS'] },
    { id: 'industrial', name: 'Fábrica del Valle Industrial', modules: ['CONTABILIDAD', 'CONCILIACION', 'NOMINAS'] },
  ];

  for (const slotData of accountingSlots) {
    const slot = await prisma.tenant.create({
      data: {
        id: `${PREFIX}acc-slot-${slotData.id}`,
        nombre: slotData.name,
        slug: generateSlug(slotData.name),
        parentId: tenant.id,
        accountType: 'BUSINESS',
        plan: 'accounting-slot',
        estado: 'activo',
        enabledModules: slotData.modules,
        billingEmail: slotData.id + '@e2e-tab.local',
        brandingConfig: {},
      },
    });
    console.log(`  ✓ ACCOUNTING_SLOT: ${slot.nombre}`);
  }

  // 6. Summary
  console.log('\n=== Seed complete ===\n');
  console.log('Resumen de datos creados:');
  console.log(`  Tenant padre:  ${tenant.id}`);
  console.log(`  Tenant slug:   ${tenant.slug}`);
  console.log(`  Usuario:       e2e-slots@test.com / ${TEST_PASSWORD}`);
  console.log(`  API Key:       ${apiKeyPlain}`);
  console.log(`  Slots totales: 5 (2 AGENCY + 2 ACCOUNTING + 1 AGENCY eliminado)`);
  console.log();
  console.log('Slots de agencia visibles: Inmobiliaria Alfa, Agencia Creativa Beta');
  console.log('Slots contables visibles:  Comercializadora del Sur, Fábrica del Valle Industrial');
  console.log('Slot eliminado (oculto):   Cliente Eliminado Gamma');
  console.log();
  console.log('URLs del test (usar tenant slug o ID):');
  console.log('  Login:           http://localhost:3099/auth/login');
  console.log(`  Config Agencia:  http://localhost:3099/${tenant.slug}/dashboard/configuracion/agency`);
  console.log(`  Config Agencia:  http://localhost:3099/${tenant.id}/dashboard/configuracion/agency`);
  console.log(`  Config Contable: http://localhost:3099/${tenant.slug}/dashboard/configuracion/accounting`);
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
