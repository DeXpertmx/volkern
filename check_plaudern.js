const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkPlaudern() {
  try {
    const integration = await prisma.plaudernIntegration.findFirst({
      include: {
        tenant: true
      }
    });
    
    if (!integration) {
      console.log('❌ No hay ninguna integración de Plaudern configurada');
      return;
    }
    
    console.log('✅ Integración de Plaudern encontrada:');
    console.log('- Tenant:', integration.tenant.nombre);
    console.log('- API Key configurado:', integration.apiKey ? '✓ Sí (JWT Token)' : '✗ No');
    console.log('- Bot ID:', integration.botId || 'No configurado');
    console.log('- Bot Name (Integration ID):', integration.botName || 'volkern-prod (default)');
    console.log('- Webhook Secret:', integration.webhookSecret ? '✓ Configurado' : '✗ No configurado');
    console.log('- Activo:', integration.activo ? '✓ Sí' : '✗ No');
    console.log('- Último error:', integration.ultimoError || 'Ninguno');
    
    console.log('\n📊 Estadísticas:');
    console.log('- Total mensajes:', integration.totalMensajesProcesados || 0);
    console.log('- Última sincronización:', integration.ultimaSincronizacion || 'Nunca');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

checkPlaudern();
