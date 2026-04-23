const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany();
  console.log('--- USERS ---');
  users.forEach(u => {
    console.log(`ID: ${u.id} | Email: ${u.email} | TenantID: ${u.tenantId}`);
  });
}

main().catch(console.error).finally(() => prisma.$disconnect());
