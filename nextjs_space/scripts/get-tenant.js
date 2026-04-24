const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function getTenant() {
  const t = await prisma.tenant.findFirst();
  console.log('ID_TENANT:', t.id);
  process.exit(0);
}
getTenant();
