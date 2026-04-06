
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('\n🔍 Buscando usuarios de prueba para eliminar...\n');

  // Encontrar usuarios de prueba (emails con patrón testuser...@example.com)
  const testUsers = await prisma.user.findMany({
    where: {
      AND: [
        {
          email: {
            contains: 'testuser',
          },
        },
        {
          email: {
            endsWith: '@example.com',
          },
        },
      ],
    },
    select: {
      id: true,
      email: true,
      name: true,
      tenantId: true,
    },
  });

  console.log(`✅ Encontrados ${testUsers.length} usuarios de prueba\n`);

  if (testUsers.length === 0) {
    console.log('✨ No hay usuarios de prueba para eliminar\n');
    return;
  }

  // Mostrar muestra de usuarios a eliminar
  console.log('📋 Muestra de usuarios que se eliminarán:');
  testUsers.slice(0, 5).forEach((u) => {
    console.log(`   - ${u.name} (${u.email})`);
  });
  if (testUsers.length > 5) {
    console.log(`   ... y ${testUsers.length - 5} más\n`);
  }

  // Confirmar eliminación
  console.log(`\n⚠️  Se eliminarán ${testUsers.length} usuarios de prueba`);
  console.log('🚀 Procediendo con la eliminación...\n');

  // Eliminar usuarios de prueba
  const deleteResult = await prisma.user.deleteMany({
    where: {
      AND: [
        {
          email: {
            contains: 'testuser',
          },
        },
        {
          email: {
            endsWith: '@example.com',
          },
        },
      ],
    },
  });

  console.log(`✅ Eliminados ${deleteResult.count} usuarios de prueba exitosamente\n`);

  // Verificar usuarios restantes en el tenant de Bruno
  const bruno = await prisma.user.findUnique({
    where: { email: 'bruno.hess@dimensionexpert.com' },
  });

  if (bruno?.tenantId) {
    const remainingUsers = await prisma.user.findMany({
      where: { tenantId: bruno.tenantId },
      select: { id: true, email: true, name: true },
      orderBy: { name: 'asc' },
    });

    console.log('👥 Usuarios restantes en el tenant de Bruno:');
    console.log(`   Total: ${remainingUsers.length}\n`);
    remainingUsers.forEach((u) => {
      console.log(`   - ${u.name} (${u.email})`);
    });
  }

  console.log('\n✨ Limpieza completada exitosamente\n');
}

main()
  .catch((error) => {
    console.error('❌ Error durante la limpieza:', error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
