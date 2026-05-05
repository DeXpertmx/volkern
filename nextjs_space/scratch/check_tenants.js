const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient({
  datasources: {
    db: { url: "postgresql://dexpert:volkern2024@localhost:5432/volkern_local" }
  }
});

async function main() {
  const tenants = await prisma.tenant.findMany({
    select: { id: true, subdomain: true, dbUrl: true }
  });
  console.log(JSON.stringify(tenants, null, 2));
  await prisma.$disconnect();
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
