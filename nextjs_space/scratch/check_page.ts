import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const slug = 'dimension-energy';
  const page = await prisma.page.findFirst({
    where: { slug },
    select: { id: true, titulo: true, slug: true, estado: true, tenantId: true }
  });

  if (!page) {
    console.log('PAGE_NOT_FOUND');
  } else {
    console.log('PAGE_FOUND:', JSON.stringify(page));
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
