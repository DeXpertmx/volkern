const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function updateTelegramIntegration() {
  const tenantId = 'local-dev-tenant';
  const botToken = "8603679260:AAG6TiEsBjEVAmL_YCwomtMsNXL2K6JRuRk";
  const mockChatId = "123456789"; // Un ID de chat de ejemplo

  try {
    const updated = await prisma.integration.update({
      where: {
        tenantId_tipo: {
          tenantId: tenantId,
          tipo: 'telegram'
        }
      },
      data: {
        conectado: true,
        activo: true,
        credenciales: {
          bot_token: botToken,
          admin_chat_id: mockChatId
        },
        configuracion: {
          admin_chat_id: mockChatId
        }
      }
    });

    console.log('✅ Telegram integration updated successfully:');
    console.log(`Tenant: ${updated.tenantId}`);
    console.log(`Credentials: ${JSON.stringify(updated.credenciales)}`);
    console.log(`Config: ${JSON.stringify(updated.configuracion)}`);
  } catch (error) {
    console.error('❌ Error updating integration:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

updateTelegramIntegration();
