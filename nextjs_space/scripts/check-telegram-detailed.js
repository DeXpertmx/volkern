const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkTelegramIntegrations() {
  const integrations = await prisma.integration.findMany({
    where: { tipo: 'telegram' },
    select: {
      tenantId: true,
      tipo: true,
      conectado: true,
      activo: true,
      credenciales: true,
      configuracion: true,
      tenant: { select: { nombre: true } }
    }
  });

  console.log('--- Detailed Telegram Integrations ---');
  integrations.forEach(i => {
    console.log(`Tenant: ${i.tenant.nombre} (${i.tenantId})`);
    console.log(`Status: Activo=${i.activo}, Conectado=${i.conectado}`);
    console.log(`Credentials: ${JSON.stringify(i.credenciales)}`);
    console.log(`Config: ${JSON.stringify(i.configuracion)}`);
    
    const creds = i.credenciales || {};
    const config = i.configuracion || {};
    const chatId = creds.admin_chat_id || config.admin_chat_id;
    console.log(`Admin Chat ID Found: ${chatId || 'NOT FOUND'}`);
    console.log('------------------------------------');
  });

  if (integrations.length === 0) {
    console.log('No Telegram integrations found.');
  }
}

checkTelegramIntegrations();
