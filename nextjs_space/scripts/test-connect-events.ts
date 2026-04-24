import { eventBus, EVENTS } from '../lib/skills/event-bus';
import { prisma } from '../lib/db';
import { initializeSkillsLayer } from '../lib/skills/init';

async function testConnectEvents() {
  console.log('🧪 Iniciando prueba de eventos de Connect...');

  // 1. Inicializar el sistema (activa el puente de eventos)
  initializeSkillsLayer();

  // Buscar un tenant real para la prueba
  const tenant = await prisma.tenant.findFirst({
    where: { nombre: { contains: 'Expert' } }
  });

  if (!tenant) {
    console.error('❌ No se encontró un tenant para la prueba');
    return;
  }

  console.log(`🏠 Usando tenant: ${tenant.nombre} (${tenant.id})`);

  // 2. Emitir un evento de Lead
  console.log('📢 Emitiendo LEAD_CREATED...');
  eventBus.emitEvent(EVENTS.LEAD_CREATED, {
    tenantId: tenant.id,
    leadId: 'test-lead-id',
    nombre: 'Cliente de Prueba Connect',
    email: 'test@example.com',
    source: 'api',
    timestamp: new Date()
  });

  // 3. Emitir un evento de Pago
  console.log('📢 Emitiendo PAYMENT_RECEIVED...');
  eventBus.emitEvent(EVENTS.PAYMENT_RECEIVED, {
    tenantId: tenant.id,
    paymentId: 'test-pay-id',
    monto: 1500,
    moneda: 'EUR',
    source: 'automation',
    timestamp: new Date()
  });

  // Esperar un poco a que se procesen los mensajes asíncronos (IA tarda más)
  await new Promise(resolve => setTimeout(resolve, 10000));

  // 4. Verificar en la DB
  const messages = await prisma.chatMessage.findMany({
    where: { tenantId: tenant.id, isSystemMessage: true },
    orderBy: { createdAt: 'desc' },
    take: 5,
    include: { channel: true, attributions: true }
  });

  console.log('\n📊 Mensajes generados en la DB:');
  messages.forEach(msg => {
    console.log(`- [${msg.channel.name}] ${msg.content}`);
    if (msg.attributions.length > 0) {
      console.log(`  🔗 Atribución: ${msg.attributions[0].entityType} (${msg.attributions[0].entityId})`);
    }
  });

  if (messages.length >= 2) {
    console.log('\n✅ Prueba completada con éxito.');
  } else {
    console.error('\n❌ No se generaron los mensajes esperados.');
  }
}

testConnectEvents().catch(console.error).finally(() => process.exit());
