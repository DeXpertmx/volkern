// ⚠️⚠️⚠️ NO EJECUTAR CONTRA PRODUCCIÓN EN VIVO (VPS / volkern.app) — OBSOLETO tras el swap de slugs del 2026-09-03
// --------------------------------------------------------------------------------------------
// Es un bootstrap SOLO para una BD recién vaciada (wipe) en desarrollo — NO para la BD de
// producción en marcha. Además codifica el mapeo anterior al swap:
//   · "Dimension eXpert" (bruno + admin@dexpert.volkern.app)  → slug dexpert (dexpert.volkern.app)
//   · "DeXpert Inmobiliaria" (datos del cliente)              → slug dimension-expert (dimension-expert.volkern.app)
// Ejecutarlo contra producción podría resetear contraseñas/nombres (p. ej. admin@dexpert → "DeXpert Admin")
// y asumir que slug dexpert es el cliente (ya NO lo es). Estado actual: GUION_DEMO_DIMENSION_EXPERT.md.
// --------------------------------------------------------------------------------------------
/**
 * [OBSOLETO para producción] Bootstrap script: crea los tenants y usuarios mínimos necesarios
 * para poder hacer login en producción después del wipe de BD por
 * `prisma db push --accept-data-loss`.
 *
 * USO: npx tsx scripts/bootstrap-admin.ts
 *
 * ⚠️ NUNCA commitear contraseñas: las nuevas contraseñas se leen de las
 * variables de entorno ADMIN_TEMP_PASSWORD y DEXPERT_ADMIN_TEMP_PASSWORD.
 * Para desarrollo se usan los valores de bootstrap-admin.env.example (no
 * commiteados); si las variables no existen el script aborta.
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
  const ADMIN_TEMP_PASSWORD = process.env.ADMIN_TEMP_PASSWORD
  if (!ADMIN_TEMP_PASSWORD) {
    console.error('❌ Define ADMIN_TEMP_PASSWORD en el entorno antes de ejecutar.')
    process.exit(1)
  }
  const adminPassword = await bcrypt.hash(ADMIN_TEMP_PASSWORD, 10)
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
  const DEXPERT_ADMIN_TEMP_PASSWORD = process.env.DEXPERT_ADMIN_TEMP_PASSWORD
  if (!DEXPERT_ADMIN_TEMP_PASSWORD) {
    console.error('❌ Define DEXPERT_ADMIN_TEMP_PASSWORD en el entorno antes de ejecutar.')
    process.exit(1)
  }
  const dexpertPassword = await bcrypt.hash(DEXPERT_ADMIN_TEMP_PASSWORD, 10)
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
  console.log('   │    → admin@volkern.app  /  (ADMIN_TEMP_PASSWORD)')
  console.log('   │')
  console.log('   │ 🏢 dexpert.volkern.app')
  console.log('   │    → admin@dexpert.volkern.app  /  (DEXPERT_ADMIN_TEMP_PASSWORD)')
  console.log('   └──────────────────────────────────────────────────────────')
  console.log('\n⚠️  Cambia las contraseñas tras el primer login.')
}

main()
  .catch((e) => {
    console.error('❌ Bootstrap falló:', e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
