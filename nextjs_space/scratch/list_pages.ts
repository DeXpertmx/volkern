import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const pages = await prisma.page.findMany({
    take: 10,
    select: { id: true, titulo: true, slug: true, estado: true }
  });

  console.log('PAGES:', JSON.stringify(pages));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
