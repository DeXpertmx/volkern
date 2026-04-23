const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkEmployees() {
  const employees = await prisma.employee.findMany({
    select: { id: true, fullName: true, tenantId: true, userId: true }
  });
  console.log('--- EMPLOYEES ---');
  employees.forEach(e => {
    console.log(`ID: ${e.id} | Name: ${e.fullName} | TenantID: ${e.tenantId} | UserID: ${e.userId}`);
  });
}

checkEmployees().finally(() => prisma.$disconnect());
