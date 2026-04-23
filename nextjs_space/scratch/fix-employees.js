const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('--- INICIANDO REPARACIÓN DE EXPEDIENTES ---');
  
  const users = await prisma.user.findMany({
    include: { employee: true }
  });

  for (const user of users) {
    if (!user.employee) {
      console.log(`Creando expediente para: ${user.email}`);
      await prisma.employee.create({
        data: {
          fullName: user.name || 'Sin Nombre',
          email: user.email,
          tenantId: user.tenantId,
          userId: user.id,
          department: 'GENERAL',
          jobTitle: 'Colaborador',
          isActive: true
        }
      });
    } else {
      console.log(`Usuario ${user.email} ya tiene expediente.`);
    }
  }
  
  console.log('--- REPARACIÓN COMPLETADA ---');
}

main().catch(console.error).finally(() => prisma.$disconnect());
