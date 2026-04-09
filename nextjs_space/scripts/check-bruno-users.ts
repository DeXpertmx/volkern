
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // 1. Encontrar el usuario Bruno Hess
  const bruno = await prisma.user.findUnique({
    where: { email: 'bruno.hess@dimensionexpert.com' },
    include: { tenant: true }
  });

  console.log('\n=== USUARIO BRUNO HESS ===');
  console.log('ID:', bruno?.id);
  console.log('Email:', bruno?.email);
  console.log('TenantId:', bruno?.tenantId);
  console.log('Tenant Nombre:', bruno?.tenant?.nombre);
  console.log('Tenant Slug:', bruno?.tenant?.slug);

  if (bruno?.tenantId) {
    // 2. Contar usuarios con ese tenantId
    const usersInTenant = await prisma.user.findMany({
      where: { tenantId: bruno.tenantId },
      include: { role: true }
    });

    console.log('\n=== USUARIOS EN EL TENANT DE BRUNO ===');
    console.log('Total:', usersInTenant.length);
    usersInTenant.forEach(u => {
      console.log(`- ${u.name} (${u.email}) - Role: ${u.role?.nombre || 'Sin rol'}`);
    });
  }

  // 3. Contar todos los usuarios en la BD
  const totalUsers = await prisma.user.count();
  console.log('\n=== TOTAL DE USUARIOS EN LA BASE DE DATOS ===');
  console.log('Total:', totalUsers);

  // 4. Usuarios sin tenant
  const usersWithoutTenant = await prisma.user.findMany({
    where: { tenantId: null },
    select: { id: true, email: true, name: true }
  });

  console.log('\n=== USUARIOS SIN TENANT ===');
  console.log('Total:', usersWithoutTenant.length);
  if (usersWithoutTenant.length > 0) {
    usersWithoutTenant.slice(0, 10).forEach(u => {
      console.log(`- ${u.name} (${u.email})`);
    });
    if (usersWithoutTenant.length > 10) {
      console.log(`... y ${usersWithoutTenant.length - 10} más`);
    }
  }

  // 5. Verificar la respuesta de la API
  console.log('\n=== SIMULANDO LLAMADA API ===');
  if (bruno?.tenantId) {
    const apiUsers = await prisma.user.findMany({
      where: {
        tenantId: bruno.tenantId,
      },
      include: {
        role: {
          select: {
            id: true,
            nombre: true,
            descripcion: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
    console.log('Usuarios que devolvería la API:', apiUsers.length);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
