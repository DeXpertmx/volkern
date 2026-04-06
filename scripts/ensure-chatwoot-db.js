const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function ensureChatwootIntegration() {
  const tenantId = 'local-dev-tenant';
  console.log(`Ensuring Chatwoot integration for tenant: ${tenantId}`);

  const integration = await prisma.integration.upsert({
    where: {
      tenantId_tipo: {
        tenantId,
        tipo: 'chatwoot'
      }
    },
    update: {
      activo: true,
      conectado: true,
      credenciales: {
        accountId: 6, // El que creamos antes
        inbox_id: "3", // El que creamos antes
        webhookSecret: "test-secret"
      }
    },
    create: {
      tenantId,
      tipo: 'chatwoot',
      nombre: 'Chatwoot Main',
      activo: true,
      conectado: true,
      credenciales: {
        accountId: 6,
        inbox_id: "3",
        webhookSecret: "test-secret"
      }
    }
  });

  console.log('✅ Chatwoot integration ready:', JSON.stringify(integration, null, 2));
}

ensureChatwootIntegration();
