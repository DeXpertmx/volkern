const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const tenant = await prisma.tenant.findUnique({
    where: { id: 'cmo09jrkc0000mf0ebul7xe9q' },
    select: { slug: true }
  });
  console.log(JSON.stringify(tenant, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
