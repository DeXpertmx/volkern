import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const slug = 'volkern-dev';
  const tenant = await prisma.tenant.findUnique({
    where: { slug },
    select: { id: true, nombre: true, slug: true, dbUrl: true }
  });

  if (!tenant) {
    console.log('TENANT_NOT_FOUND');
    // List some tenants
    const allTenants = await prisma.tenant.findMany({ take: 5, select: { slug: true } });
    console.log('AVAILABLE_TENANTS:', JSON.stringify(allTenants));
  } else {
    console.log('TENANT_FOUND:', JSON.stringify(tenant));
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
