import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const templates = await prisma.pageTemplate.findMany({
    select: { id: true, nombre: true }
  });
  console.log('Templates found:', JSON.stringify(templates, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
