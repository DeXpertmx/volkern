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
      apiKey: true,
      activo: true
    }
  });
  
  if (integration) {
    console.log('Integration ID being used:', integration.botName || 'volkern-prod');
    console.log('API Key present:', integration.apiKey ? 'Yes' : 'No');
    console.log('API Key length:', integration.apiKey ? integration.apiKey.length : 0);
    console.log('API Key first 20 chars:', integration.apiKey ? integration.apiKey.substring(0, 20) + '...' : 'N/A');
  } else {
    console.log('No integration found');
  }
}

main()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());
