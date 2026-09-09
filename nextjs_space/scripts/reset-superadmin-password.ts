/**
 * Reset de la contraseña del Superadmin de plataforma (admin@volkern.app).
 *
 * Idempotente: re-correrlo siempre deja la contraseña en el valor de la
 * variable de entorno SUPERADMIN_TEMP_PASSWORD.
 * NO toca tenantId/roleId del usuario (a diferencia de bootstrap-admin.ts,
 * que reasigna el usuario a un tenant "Volkern Admin HQ" nuevo).
 *
 * ⚠️ NUNCA commitear contraseñas: la nueva contraseña se lee de
 * SUPERADMIN_TEMP_PASSWORD y el script aborta si no está definida.
 *
 * USO: SUPERADMIN_TEMP_PASSWORD='...' npx tsx -r dotenv/config scripts/reset-superadmin-password.ts
 */
import { prisma } from '../lib/db';
import bcrypt from 'bcryptjs';

const SUPERADMIN_EMAIL = 'admin@volkern.app';

async function main() {
  const existing = await prisma.user.findUnique({
    where: { email: SUPERADMIN_EMAIL },
    include: {
      role: { select: { nombre: true } },
      tenant: { select: { subdomain: true, accountType: true } },
    },
  });

  if (!existing) {
    console.error(`❌ Usuario ${SUPERADMIN_EMAIL} no encontrado`);
    process.exit(1);
  }
  if (existing.role?.nombre !== 'Superadmin') {
    console.error(`❌ ${SUPERADMIN_EMAIL} tiene rol "${existing.role?.nombre}" — no es Superadmin; abortando`);
    process.exit(1);
  }

  const NEW_PASSWORD = process.env.SUPERADMIN_TEMP_PASSWORD;
  if (!NEW_PASSWORD) {
    console.error('❌ Define SUPERADMIN_TEMP_PASSWORD en el entorno antes de ejecutar.');
    process.exit(1);
  }

  const hashed = await bcrypt.hash(NEW_PASSWORD, 10);

  await prisma.user.update({
    where: { id: existing.id },
    data: {
      password: hashed,
      estado: 'activo',
      isTwoFactorEnabled: false,
    },
  });

  // Auto-verificación contra el hash recién guardado
  const check = await prisma.user.findUnique({
    where: { id: existing.id },
    select: { password: true },
  });
  const ok = !!check?.password && (await bcrypt.compare(NEW_PASSWORD, check.password));

  console.log('✅ Password del Superadmin de plataforma reseteado');
  console.log(`   email   : ${SUPERADMIN_EMAIL}`);
  console.log(`   password: (leída de SUPERADMIN_TEMP_PASSWORD)`);
  console.log(`   rol     : ${existing.role?.nombre}`);
  console.log(`   tenant  : ${existing.tenant?.subdomain ?? '(sin subdominio)'} (${existing.tenant?.accountType})`);
  console.log(`   verificación bcrypt: ${ok ? 'OK' : 'FALLÓ'}`);
  console.log('⚠️  Cámbiala tras la demo si este entorno es compartido/producción.');
}

main()
  .catch((e) => {
    console.error('❌ Error:', e.message || e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
