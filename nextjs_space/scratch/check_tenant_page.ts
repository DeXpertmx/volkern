import { PrismaClient } from '@prisma/client';

async function main() {
  const dbUrl = 'postgresql://dexpert:volkern2024@localhost:5432/volkern_tenant_volkern_dev?schema=public';
  const slug = 'dimension-energy';

  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: dbUrl
      }
    }
  });

  try {
    const page = await prisma.page.findFirst({
      where: { slug },
      select: { id: true, titulo: true, slug: true, estado: true }
    });

    if (!page) {
      console.log('PAGE_NOT_FOUND_IN_TENANT_DB');
      const all = await prisma.page.findMany({ take: 5, select: { slug: true, estado: true } });
      console.log('TENANT_PAGES:', JSON.stringify(all));
    } else {
      console.log('PAGE_FOUND_IN_TENANT_DB:', JSON.stringify(page));
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(console.error);
