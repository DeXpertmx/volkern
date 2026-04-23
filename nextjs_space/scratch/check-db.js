const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const userCount = await prisma.user.count();
  const employeeCount = await prisma.employee.count();
  const users = await prisma.user.findMany({ include: { employee: true } });
  
  console.log('--- DB STATUS ---');
  console.log('Total Users:', userCount);
  console.log('Total Employees:', employeeCount);
  console.log('--- DETALLE ---');
  users.forEach(u => {
    console.log(`User: ${u.email} | Has Employee: ${!!u.employee}`);
  });
}

main().catch(console.error).finally(() => prisma.$disconnect());
