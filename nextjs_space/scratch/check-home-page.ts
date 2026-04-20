import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const page = await prisma.page.findFirst({
    where: { slug: 'home', tenantId: null }
  });
  console.log(JSON.stringify(page, null, 2));
}
main();
