const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function prepareTenantForChatbot() {
  const tenantId = 'local-dev-tenant';
  console.log(`Preparing tenant ${tenantId} for chatbot testing...`);

  // 1. Asegurar ChatbotConfig
  await prisma.chatbotConfig.upsert({
    where: { tenantId },
    update: {
      activo: true,
      nombreAsistente: 'Volker AI (Test)',
      contextoNegocio: 'Somos una empresa de tecnología que ayuda a negocios a automatizar su CRM.',
      personalidad: 'Útil, profesional y un poco divertido.',
    },
    create: {
      tenantId,
      activo: true,
      nombreAsistente: 'Volker AI (Test)',
      contextoNegocio: 'Somos una empresa de tecnología que ayuda a negocios a automatizar su CRM.',
      personalidad: 'Útil, profesional y un poco divertido.',
    }
  });

  // 2. Asegurar TenantFeature (Suscripción al servicio)
  await prisma.tenantFeature.upsert({
    where: {
      tenantId_feature: {
        tenantId,
        feature: 'chatbot_whatsapp' // El ID del módulo en lib/plans.ts
      }
    },
    update: { habilitado: true },
    create: {
      tenantId,
      feature: 'chatbot_whatsapp',
      habilitado: true
    }
  });

  console.log('✅ Tenant prepared for chatbot.');
}

prepareTenantForChatbot();
