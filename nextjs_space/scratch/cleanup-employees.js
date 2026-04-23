const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function cleanup() {
  console.log('Limpiando duplicados de Ana García...');
  
  // Mantener solo la que tiene UserID (la principal)
  const employees = await prisma.employee.findMany({
    where: { fullName: 'Ana García' }
  });
  
  for (const emp of employees) {
    if (!emp.userId) {
      console.log(`Eliminando duplicado sin usuario: ${emp.id}`);
      await prisma.employee.delete({ where: { id: emp.id } });
    }
  }
  
  console.log('Limpieza completada.');
}

cleanup().finally(() => prisma.$disconnect());
