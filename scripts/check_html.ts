import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()
async function main() {
  const page = await prisma.page.findFirst({
    where: { slug: 'home', tenantId: null },
    select: { contenido: true }
  })
  if (page) {
    const html = (page.contenido as any).html;
    console.log("HTML CONTENT:", html?.substring(0, 500));
  }
}
main().catch(console.error).finally(() => prisma.$disconnect())
