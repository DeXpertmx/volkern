const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkTelegramIntegrations() {
  const integrations = await prisma.integration.findMany({
    where: { tipo: 'telegram' },
    include: { tenant: true }
  });

  console.log('--- Telegram Integrations ---');
  integrations.forEach(integration => {
    console.log(`Tenant: ${integration.tenant.nombre} (${integration.tenantId})`);
    console.log(`Activo: ${integration.activo}`);
    console.log(`Conectado: ${integration.conectado}`);
    console.log(`Credenciales: ${JSON.stringify(integration.credenciales)}`);
    console.log('------------------------------');
  });

  if (integrations.length === 0) {
    console.log('No Telegram integrations found.');
  }
}

checkTelegramIntegrations();
