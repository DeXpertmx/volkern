const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const tenant = await prisma.tenant.findUnique({
    where: { slug: 'volkern-default' },
    select: { enabledModules: true, plan: true }
  });
  console.log('Modules:', tenant.enabledModules);
}

main().catch(console.error).finally(() => prisma.$disconnect());
