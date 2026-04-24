import { prisma } from './lib/db';
import { ConnectService } from './lib/connect/connect-service';

async function diagnose() {
  try {
    const tenantId = 'test-new-tenant-' + Date.now(); 
    await prisma.tenant.create({
      data: {
        id: tenantId,
        nombre: 'Test Tenant',
        slug: 'test-tenant-' + Date.now(),
        plan: 'FREE'
      }
    });
    // Crear un usuario fake
    const user = await prisma.user.create({
      data: {
        id: 'user-' + Date.now(),
        email: 'test-' + Date.now() + '@example.com',
        tenantId,
        estado: 'activo'
      }
    });
    const userId = user.id;
    
    console.log('--- DIAGNÓSTICO CONNECT ---');
    
    // Probar creación de canales
    console.log('Probando ensureCoreChannels...');
    await ConnectService.ensureCoreChannels(tenantId);
    console.log('ensureCoreChannels completado.');

    // 1. Verificar Canales
    const channels = await prisma.chatChannel.findMany({
      where: { tenantId }
    });
    console.log(`Canales encontrados: ${channels.length}`);
    channels.forEach(c => console.log(` - ${c.name} (${c.type})`));

    // 2. Verificar Suscripciones
    const subs = await prisma.chatSubscription.findMany({
      where: { userId }
    });
    console.log(`Suscripciones del usuario: ${subs.length}`);

    // 3. Probar lógica de GET /api/connect/channels
    const subscriptions = await prisma.chatSubscription.findMany({
      where: { userId, tenantId },
      include: { channel: true }
    });
    
    console.log('Calculando metadata...');
    for (const sub of subscriptions) {
      const unreadCount = await prisma.chatMessage.count({
        where: {
          channelId: sub.channelId,
          createdAt: { gt: sub.lastReadAt },
          senderId: { not: userId }
        }
      });
      console.log(`Channel ${sub.channel.name}: ${unreadCount} unread`);
    }

    console.log('✅ Diagnóstico completado sin errores catastróficos');
  } catch (error) {
    console.error('❌ ERROR EN DIAGNÓSTICO:', error);
  } finally {
    process.exit();
  }
}

diagnose();
