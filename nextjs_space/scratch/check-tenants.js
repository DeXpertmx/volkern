const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const tenants = await prisma.tenant.findMany({
    select: {
      id: true,
      nombre: true,
      subdomain: true,
      dbUrl: true
    }
  });

  console.log('Tenants encontrados:');
  tenants.forEach(t => {
    console.log(`- ${t.nombre} (${t.subdomain}): ID=${t.id}, dbUrl=${t.dbUrl ? 'SET' : 'NOT SET'}`);
    if (t.dbUrl) {
       console.log(`  URL: ${t.dbUrl.split('@')[1] || 'INVALID'}`);
    }
  });
}

main()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());
