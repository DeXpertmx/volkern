
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  const tenants = await prisma.tenant.findMany();
  console.log(JSON.stringify(tenants, null, 2));
  await prisma.$disconnect();
}

check();
