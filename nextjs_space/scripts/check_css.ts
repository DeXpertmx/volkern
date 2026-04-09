import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()
async function main() {
  const page = await prisma.page.findFirst({
    where: { slug: 'home', tenantId: null },
    select: { cssPersonalizado: true }
  })
  if (page) {
    console.log("CSS LENGTH:", page.cssPersonalizado?.length);
    console.log("CSS CONTENT:", page.cssPersonalizado?.substring(0, 1000));
  } else {
    console.log("No global home page found");
  }
}
main().catch(console.error).finally(() => prisma.$disconnect())
