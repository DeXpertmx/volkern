/**
 * Volkern Skills Layer Initialization
 * 
 * Este archivo inicializa todos los componentes del Skills Layer:
 * - EventBus (ya es singleton, se inicializa automáticamente)
 * - AutomationListeners (conecta EventBus → AutomationEngine)
 * 
 * Importar este archivo una vez en la aplicación para activar el Skills Layer.
 * 
 * Uso:
 * import '@/lib/skills/init';
 */

import { initializeAutomationListeners, getAutomationListenerStatus } from './automation-listener';
import { eventBus } from './event-bus';
import { BillingService } from '@/lib/finance/billing-service';
import { setupMarketingEventBridge } from '@/lib/marketing/automation/event-bridge';
import { setupWorkflowWorker } from '@/lib/marketing/automation/workflow-worker';
import { initMarketingQueues } from '@/lib/core/queue-service';
import { initMarketingWorkers } from '@/lib/workers/marketing-worker';
import { AutomationRuleEngine } from '@/lib/marketing/automation/rule-engine';
import { QueueMonitorService } from '@/lib/marketing/queues/queue-monitor-service';
import { initializeAccountingListeners } from '@/lib/accounting/accounting-listener';

// Evitar múltiples inicializaciones
let initialized = false;

export function initializeSkillsLayer(): void {
  if (initialized) {
    console.log('🟡 [SkillsLayer] Ya está inicializado, omitiendo...');
    return;
  }

  // 0. Validar MASTER_KEY (Integridad de 'The Vault')
  if (typeof window === 'undefined') {
    const masterKey = process.env.MASTER_KEY;
    const controlHash = process.env.VAULT_CONTROL_HASH;
    const pepper = process.env.TENANT_PEPPER;

    const bannerRed = '\x1b[41m\x1b[37m\x1b[1m';
    const textRed = '\x1b[31;1m';
    const reset = '\x1b[0m';

    if (!masterKey || !controlHash) {
      console.error(`\n${bannerRed} CRITICAL SECURITY ERROR ${reset}`);
      console.error(`${textRed}Faltan MASTER_KEY o VAULT_CONTROL_HASH en el entorno.${reset}`);
      console.error(`El sistema no puede iniciar sin las claves de cifrado maestras.\n`);
      process.exit(1);
    }

    // Validación de longitud (32 bytes para AES-256)
    const keyBuffer = Buffer.from(masterKey);
    if (keyBuffer.length !== 32) {
      console.error(`\n${bannerRed} CRITICAL SECURITY ERROR ${reset}`);
      console.error(`${textRed}MASTER_KEY inválida: Debe tener exactamente 32 bytes (AES-256).${reset}`);
      console.error(`Longitud detectada: ${keyBuffer.length} bytes.\n`);
      process.exit(1);
    }

    const crypto = require('crypto');
    const actualHash = crypto.createHash('sha256').update(masterKey).digest('hex');

    if (actualHash !== controlHash) {
      console.error(`\n${bannerRed} CRITICAL SECURITY ERROR ${reset}`);
      console.error(`${textRed}Fallo de integridad: La MASTER_KEY no coincide con el hash de control.${reset}`);
      console.error(`Asegúrate de que la clave maestra no haya sido alterada.\n`);
      process.exit(1);
    }

    if (!pepper) {
      console.warn(`\n\x1b[33;1m⚠️ [Vault] AVISO: TENANT_PEPPER no definido. Se recomienda encarecidamente para fortalecer la derivación de claves.${reset}\n`);
    }

    console.log('🛡️ [Vault] Integridad de MASTER_KEY validada (32 bytes OK)');
  }

  console.log('\n🚀 ========================================');
  console.log('🚀 VOLKERN SKILLS LAYER - INICIALIZANDO');
  console.log('🚀 ========================================\n');

  // 1. Verificar EventBus
  console.log('✅ [SkillsLayer] EventBus singleton activo');

  // 2. Inicializar listeners de automatización
  initializeAutomationListeners();

  // 3. Inicializar servicios de negocio (Finanzas y Contabilidad)
  BillingService.init();
  initializeAccountingListeners();

  // 4. Inicializar automatización de Marketing (EventBridge es síncrono, Redis-deps son async)
  setupMarketingEventBridge();

  // Las siguientes inicializaciones son async y tolerantes a Redis offline
  Promise.all([
    initMarketingQueues(),
    setupWorkflowWorker(),
    initMarketingWorkers(),
    AutomationRuleEngine.initialize(),
    QueueMonitorService.init(),
  ]).then(() => {
    console.log('📬 [SkillsLayer] Subsistemas de colas revisados.');
  }).catch((err) => {
    console.warn('[SkillsLayer] Error al inicializar subsistemas de colas:', err?.message);
  });

  // 5. Log estado final
  const status = getAutomationListenerStatus();
  console.log('\n📊 [SkillsLayer] Estado:');
  console.log(`   - Eventos mapeados: ${status.mappedEvents.length}`);
  console.log(`   - Listeners activos: ${status.eventBusListenerCount}`);

  console.log('\n✅ [SkillsLayer] Inicialización completa');
  console.log('🚀 ========================================\n');

  initialized = true;
}

// Auto-inicializar al importar en entorno servidor
if (typeof window === 'undefined') {
  initializeSkillsLayer();
}

// Exportar para uso explícito si es necesario
export { eventBus };
export { initializeAutomationListeners } from './automation-listener';
export * from './index';
