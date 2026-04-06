import { notificationService } from '../lib/skills/notification-layer';
import { createSystemContext } from '../lib/skills/context';

async function verifyTelegramDispatch() {
  const tenantId = 'local-dev-tenant';
  const context = createSystemContext(tenantId);

  console.log('--- Verifying Telegram Dispatch Logic ---');
  console.log(`Tenant: ${tenantId}`);

  try {
    // Simulamos una notificación de email para un admin
    // Esto debería disparar el auto-Telegram en NotificationService
    const result = await notificationService.send(
      { type: 'user', email: 'admin@volkern.app' },
      { 
        subject: 'Test Integration', 
        body: 'Esta es una prueba de integración de Telegram.' 
      },
      { channel: 'email', priority: 'high' },
      context
    );

    console.log('✅ Notification Layers processed successfully.');
    console.log(`Main Channel Result: ${JSON.stringify(result)}`);
    console.log('Check the console output for "Sending telegram notification" logs if any.');
  } catch (error: any) {
    console.error('❌ Error during verification:', error.message);
  }
}

verifyTelegramDispatch();
