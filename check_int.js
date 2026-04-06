require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const integration = await prisma.plaudernIntegration.findFirst({
    select: {
      id: true,
      tenantId: true,
      botName: true,
      botId: true,
      activo: true
    }
  });
  
  console.log('Plaudern Integration Config:');
  console.log(JSON.stringify(integration, null, 2));
  console.log('\nIntegration ID being used:', integration?.botName || 'volkern-prod');
  console.log('API Key present:', integration?.apiKey ? 'Yes (hidden)' : 'No');
}

main()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());
