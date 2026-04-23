const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const employees = await prisma.employee.findMany();
  console.log('--- EMPLOYEES ---');
  employees.forEach(e => {
    console.log(`ID: ${e.id} | Name: ${e.fullName} | UserID: ${e.userId} | Email: ${e.email}`);
  });
}

main().catch(console.error).finally(() => prisma.$disconnect());
