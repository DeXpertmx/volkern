/**
 * Bootstrap script: crea los tenants y usuarios mínimos necesarios
 * para poder hacer login en producción después del wipe de BD por
 * `prisma db push --accept-data-loss`.
 *
 * USO: npx tsx scripts/bootstrap-admin.ts
 *
 * CREDENCIALES RESULTANTES (cámbialas tras el primer login):
 *   admin.volkern.app/admin → admin@volkern.app       / Admin123!
 *   dexpert.volkern.app      → admin@dexpert.volkern.app / Dexpert123!
 *
 * Script idempotente (usa upsert). Se puede correr múltiples veces.
 */
import { PrismaClient, AccountType } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  console.log('🚀 Bootstrapping admin tenant + admin users en producción\n')

  // ─── 1. Admin HQ tenant (usado para admin.volkern.app/*) ───
  // NOTA: AccountType enum no tiene valor 'ADMIN'. El acceso a /admin/*
  // se valida por el ROL del usuario (Superadmin/Admin/Administrador),
  // no por accountType. Usamos AGENCY para este tenant.
  const adminTenant = await prisma.tenant.upsert({
    where: { subdomain: 'admin' },
    update: {},
    create: {
      nombre: 'Volkern Admin HQ',
      slug: 'volkern-admin',
      subdomain: 'admin',
      accountType: AccountType.AGENCY,
      plan: 'enterprise',
    },
  })
  console.log(`  ✓ Admin tenant: ${adminTenant.id} (subdomain='admin')`)

  // ─── 2. DeXpert client tenant (para dexpert.volkern.app) ───
  const dexpertTenant = await prisma.tenant.upsert({
    where: { subdomain: 'dexpert' },
    update: {},
    create: {
      nombre: 'DeXpert Inmobiliaria',
      slug: 'dexpert',
      subdomain: 'dexpert',
      accountType: AccountType.BUSINESS,
      plan: 'premium',
    },
  })
  console.log(`  ✓ DeXpert tenant: ${dexpertTenant.id} (subdomain='dexpert')`)

  // ─── 3. Superadmin role (Admin tenant, acceso total) ───
  const superadminRole = await prisma.role.upsert({
    where: {
      tenantId_nombre: { tenantId: adminTenant.id, nombre: 'Superadmin' },
    },
    update: {},
    create: {
      tenantId: adminTenant.id,
      nombre: 'Superadmin',
      descripcion: 'Acceso total al sistema',
      permisos: { all: true },
      esPersonalizado: false,
      orden: 0,
    },
  })
  console.log(`  ✓ Superadmin role: ${superadminRole.id}`)

  // ─── 4. Admin role (DeXpert tenant) ───
  const adminDexpertRole = await prisma.role.upsert({
    where: {
      tenantId_nombre: { tenantId: dexpertTenant.id, nombre: 'Admin' },
    },
    update: {},
    create: {
      tenantId: dexpertTenant.id,
      nombre: 'Admin',
      descripcion: 'Acceso total a este tenant',
      permisos: { all: true },
      esPersonalizado: false,
      orden: 0,
    },
  })
  console.log(`  ✓ DeXpert Admin role: ${adminDexpertRole.id}`)

  // ─── 5. Admin user (superadmin global) ───
  const adminPassword = await bcrypt.hash('Admin123!', 10)
  const adminUser = await prisma.user.upsert({
    where: { email: 'admin@volkern.app' },
    update: {
      password: adminPassword,
      roleId: superadminRole.id,
      tenantId: adminTenant.id,
      estado: 'activo',
      isTwoFactorEnabled: false,
    },
    create: {
      email: 'admin@volkern.app',
      name: 'Admin Global',
      password: adminPassword,
      tenantId: adminTenant.id,
      roleId: superadminRole.id,
      estado: 'activo',
      emailVerified: new Date(),
      isTwoFactorEnabled: false,
    },
  })
  console.log(`  ✓ Admin user: ${adminUser.email}`)

  // ─── 6. DeXpert user ───
  const dexpertPassword = await bcrypt.hash('Dexpert123!', 10)
  const dexpertUser = await prisma.user.upsert({
    where: { email: 'admin@dexpert.volkern.app' },
    update: {
      password: dexpertPassword,
      roleId: adminDexpertRole.id,
      tenantId: dexpertTenant.id,
      estado: 'activo',
      isTwoFactorEnabled: false,
    },
    create: {
      email: 'admin@dexpert.volkern.app',
      name: 'DeXpert Admin',
      password: dexpertPassword,
      tenantId: dexpertTenant.id,
      roleId: adminDexpertRole.id,
      estado: 'activo',
      emailVerified: new Date(),
      isTwoFactorEnabled: false,
    },
  })
  console.log(`  ✓ DeXpert user: ${dexpertUser.email}`)

  console.log('\n📋 CREDENCIALES DE ACCESO INMEDIATO')
  console.log('   ┌──────────────────────────────────────────────────────────')
  console.log('   │ 🔐 admin.volkern.app/admin')
  console.log('   │    → admin@volkern.app  /  Admin123!')
  console.log('   │')
  console.log('   │ 🏢 dexpert.volkern.app')
  console.log('   │    → admin@dexpert.volkern.app  /  Dexpert123!')
  console.log('   └──────────────────────────────────────────────────────────')
  console.log('\n⚠️  Cambia las contraseñas tras el primer login.')
}

main()
  .catch((e) => {
    console.error('❌ Bootstrap falló:', e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
