const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const result = await prisma.tenant.updateMany({
    data: { stripeCustomerId: null }
  });
  console.log(`✅ IDs de Stripe limpiados: ${result.count}`);
}

main()
  .catch(e => console.error(e))
  .finally(async () => await prisma.$disconnect());
