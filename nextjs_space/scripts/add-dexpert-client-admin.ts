// ⚠️⚠️⚠️ NO EJECUTAR CONTRA PRODUCCIÓN (VPS / volkern.app) — OBSOLETO tras el swap de slugs del 2026-09-03
// --------------------------------------------------------------------------------------------
// El 2026-09-03 se intercambiaron slug/subdomain en producción:
//   · "Dimension eXpert" (bruno + admin@dexpert.volkern.app)  → slug dexpert (dexpert.volkern.app)
//   · "DeXpert Inmobiliaria" (datos del cliente)              → slug dimension-expert (dimension-expert.volkern.app)
// Este script crea/resetea direccion@dexpert.volkern.app en el tenant slug='dexpert', que AHORA es
// el workspace de Dimension eXpert, NO el del cliente. La cuenta real del cliente es hoy
// dximobilia@dimensionexpert.com (ver GUION_DEMO_DIMENSION_EXPERT.md). Solo usar contra BD local.
// --------------------------------------------------------------------------------------------
/**
 * [OBSOLETO para producción] Crea la cuenta Admin dedicada del tenant cliente "DeXpert Inmobiliaria"
 * (slug=dexpert), replicando las convenciones de scripts/bootstrap-admin.ts:
 *   - nombre visible : 'DeXpert Admin'
 *   - contraseña     : variable de entorno DEXPERT_ADMIN_TEMP_PASSWORD (bcrypt, 10 rondas)
 *   - rol            : Admin del tenant (permisos { all: true })
 *   - estado         : activo, emailVerified, sin 2FA
 *
 * Email distinto a admin@dexpert.volkern.app a propósito: esa dirección es
 * única en el sistema y ahora pertenece a la cuenta migrada a dimension-expert;
 * reutilizarla (o re-ejecutar bootstrap-admin.ts) desharía la migración.
 *
 * ⚠️ NUNCA commitear contraseñas: la nueva contraseña se lee de
 * DEXPERT_ADMIN_TEMP_PASSWORD y el script aborta si no está definida.
 *
 * Idempotente: si la cuenta ya existe en el tenant dexpert, solo resetea su
 * password/estado a la convención. No toca datos del tenant.
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
const p = new PrismaClient();

const TENANT_SLUG = 'dexpert';
const EMAIL = 'direccion@dexpert.volkern.app';
const NAME = 'DeXpert Admin';

async function main() {
  const tenant = await p.tenant.findUnique({ where: { slug: TENANT_SLUG } });
  if (!tenant) throw new Error(`No existe tenant slug=${TENANT_SLUG}`);
  const role = await p.role.findFirst({
    where: { tenantId: tenant.id, nombre: 'Admin' },
  });
  if (!role) throw new Error(`El tenant ${TENANT_SLUG} no tiene rol Admin`);

  const existing = await p.user.findUnique({ where: { email: EMAIL } });
  if (existing && existing.tenantId !== tenant.id) {
    throw new Error(`El email ${EMAIL} ya existe en otro tenant (${existing.tenantId}); elige otro`);
  }

  const PASSWORD = process.env.DEXPERT_ADMIN_TEMP_PASSWORD;
  if (!PASSWORD) {
    console.error('❌ Define DEXPERT_ADMIN_TEMP_PASSWORD en el entorno antes de ejecutar.');
    process.exit(1);
  }

  const password = await bcrypt.hash(PASSWORD, 10);
  const user = await p.user.upsert({
    where: { email: EMAIL },
    update: {
      name: NAME,
      password,
      tenantId: tenant.id,
      roleId: role.id,
      estado: 'activo',
      isTwoFactorEnabled: false,
    },
    create: {
      email: EMAIL,
      name: NAME,
      password,
      tenantId: tenant.id,
      roleId: role.id,
      estado: 'activo',
      emailVerified: new Date(),
      isTwoFactorEnabled: false,
    },
  });

  console.log(`  ✓ Cuenta cliente creada/actualizada: ${user.email}`);
  console.log(`    tenant=${tenant.nombre} | rol=${role.nombre} | nombre="${NAME}"`);
  console.log(`    login: http://localhost:3000/auth/login  (${EMAIL} / contraseña de DEXPERT_ADMIN_TEMP_PASSWORD)`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => p.$disconnect());
