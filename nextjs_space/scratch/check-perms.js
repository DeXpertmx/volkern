const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkAdminPermissions() {
  const adminRole = await prisma.role.findFirst({
    where: { nombre: 'Admin' }
  });
  
  if (!adminRole) {
    console.log('Role "Admin" not found');
    return;
  }
  
  console.log('--- ADMIN PERMISSIONS ---');
  console.log(JSON.stringify(adminRole.permisos, null, 2));
}

checkAdminPermissions().finally(() => prisma.$disconnect());
