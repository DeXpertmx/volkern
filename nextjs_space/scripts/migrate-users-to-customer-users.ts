/**
 * Migration Script: Migrate existing User (NextAuth) records to erp_customer_users.
 *
 * Los usuarios admin/demo existentes solo están en la tabla `User` (NextAuth),
 * pero la app móvil autentica contra `erp_customer_users`. Este script copia
 * los usuarios con password + tenantId a `erp_customer_users` para que puedan
 * iniciar sesión desde la app móvil sin depender del fallback.
 *
 * Uso:
 *   npx tsx --require ./scripts/cargar-entorno.cjs scripts/migrate-users-to-customer-users.ts
 */
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';

const prisma = new PrismaClient();

function splitName(fullName: string | null): { firstName: string | null; lastName: string | null } {
  if (!fullName) return { firstName: null, lastName: null };
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0], lastName: null };
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(' '),
  };
}

async function main() {
  console.log('\n🔍 Buscando usuarios en tabla User (NextAuth) para migrar a erp_customer_users...\n');

  // 1. Obtener todos los usuarios de la tabla User que tengan password + tenantId
  const users = await prisma.user.findMany({
    where: {
      password: { not: null },
      tenantId: { not: null },
    },
    include: {
      role: { select: { nombre: true } },
      tenant: { select: { id: true, nombre: true, slug: true } },
    },
    orderBy: { email: 'asc' },
  });

  console.log(`📊 Total usuarios elegibles (con password + tenantId): ${users.length}\n`);

  if (users.length === 0) {
    console.log('❌ No hay usuarios para migrar. Saliendo...\n');
    return;
  }

  // 2. Verificar cuáles ya existen en erp_customer_users
  const existingEmails = await prisma.erp_customer_users.findMany({
    where: { email: { in: users.map((u) => u.email) } },
    select: { email: true },
  });
  const existingSet = new Set(existingEmails.map((e) => e.email));

  const toMigrate = users.filter((u) => !existingSet.has(u.email));
  const skipped = users.filter((u) => existingSet.has(u.email));

  if (skipped.length > 0) {
    console.log(`⏭️  Usuarios saltados (ya existen en erp_customer_users): ${skipped.length}`);
    skipped.forEach((u) => console.log(`   - ${u.email} (${u.name})`));
    console.log('');
  }

  if (toMigrate.length === 0) {
    console.log('✅ Todos los usuarios ya están migrados. No hay nada que hacer.\n');
    return;
  }

  console.log(`🚀 Migrando ${toMigrate.length} usuarios...\n`);

  let migrated = 0;
  let errors = 0;

  for (const user of toMigrate) {
    try {
      const { firstName, lastName } = splitName(user.name);

      // Determinar rol: mapear role.nombre de User a erp_customer_users.role
      const roleName = user.role?.nombre || 'admin';
      const customerRole = roleName === 'Admin' || roleName === 'admin' || roleName === 'SUPER_ADMIN'
        ? 'ADMIN'
        : 'USER';

      // Determinar isActive basado en estado
      const isActive = user.estado === 'activo';

      await prisma.erp_customer_users.create({
        data: {
          id: user.id, // Usar el mismo ID que en User
          tenantId: user.tenantId!,
          email: user.email,
          passwordHash: user.password!, // bcrypt hash ya existente
          firstName,
          lastName,
          role: customerRole,
          isActive,
          createdAt: user.createdAt,
          updatedAt: new Date(),
          // Crear perfil asociado
          erp_customer_profiles: {
            create: {
              id: randomUUID(),
              preferredLanguage: 'es',
              timezone: 'UTC',
              notificationsEnabled: true,
            },
          },
        },
      });

      console.log(`   ✅ ${user.email} (${user.name || 'sin nombre'}) → tenant: ${user.tenant?.slug || user.tenantId}`);
      migrated++;
    } catch (error: any) {
      console.error(`   ❌ Error migrando ${user.email}: ${error.message}`);
      errors++;
    }
  }

  console.log(`\n📋 Resumen:`);
  console.log(`   - Migrados: ${migrated}`);
  console.log(`   - Errores: ${errors}`);
  console.log(`   - Saltados (ya existían): ${skipped.length}`);
  console.log('');

  // 3. Verificación final
  const totalCustomerUsers = await prisma.erp_customer_users.count();
  console.log(`📊 Total en erp_customer_users ahora: ${totalCustomerUsers}`);
  console.log(`📊 Total en User (NextAuth): ${await prisma.user.count()}`);
  console.log('\n✨ Migración completada.\n');
}

main()
  .catch((error) => {
    console.error('❌ Error fatal:', error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
