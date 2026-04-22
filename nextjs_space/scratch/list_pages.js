const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const pages = await prisma.page.findMany({
    take: 5,
    select: { id: true, titulo: true, slug: true, tenantId: true }
  });
  console.log(JSON.stringify(pages, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
