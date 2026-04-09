require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const integrations = await prisma.plaudernIntegration.findMany({
    select: {
      id: true,
      tenantId: true,
      botName: true,
      activo: true,
      botId: true
    }
  });
  
  console.log('Plaudern Integrations:');
  console.log(JSON.stringify(integrations, null, 2));
}

main()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());
