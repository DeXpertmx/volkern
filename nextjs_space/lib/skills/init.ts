/**
 * Volkern Skills Layer Initialization
 * 
 * This file initializes all Skills Layer components.
 * Use dynamic imports to avoid webpack bundling issues.
 */

import { eventBus } from './event-bus';

// Dynamic imports - only load on server
async function loadServerModules() {
  const [
    { initializeAutomationListeners, getAutomationListenerStatus },
    { BillingService },
    { setupMarketingEventBridge },
    { setupWorkflowWorker },
    { initMarketingQueues },
    { initMarketingWorkers },
    { AutomationRuleEngine },
    { QueueMonitorService },
    { initializeAccountingListeners },
    { initConnectEventBridge },
  ] = await Promise.all([
    import('./automation-listener'),
    import('@/lib/finance/billing-service'),
    import('@/lib/marketing/automation/event-bridge'),
    import('@/lib/marketing/automation/workflow-worker'),
    import('@/lib/core/queue-service'),
    import('@/lib/workers/marketing-worker'),
    import('@/lib/marketing/automation/rule-engine'),
    import('@/lib/marketing/queues/queue-monitor-service'),
    import('@/lib/accounting/accounting-listener'),
    import('@/lib/connect/connect-event-bridge'),
  ]);

  return {
    initializeAutomationListeners,
    getAutomationListenerStatus,
    BillingService,
    setupMarketingEventBridge,
    setupWorkflowWorker,
    initMarketingQueues,
    initMarketingWorkers,
    AutomationRuleEngine,
    QueueMonitorService,
    initializeAccountingListeners,
    initConnectEventBridge,
  };
}

// Prevent multiple initializations
let initialized = false;

export async function initializeSkillsLayer(): Promise<void> {
  if (initialized) {
    console.log('🟡 [SkillsLayer] Already initialized, skipping...');
    return;
  }

  console.log('\n🚀 ========================================');
  console.log('🚀 VOLKERN SKILLS LAYER - INITIALIZING');
  console.log('🚀 ========================================\n');

  // Load server modules dynamically
  const modules = await loadServerModules();

  // 1. Verify EventBus
  console.log('✅ [SkillsLayer] EventBus singleton active');

  // 2. Initialize automation listeners
  modules.initializeAutomationListeners();

  // 3. Initialize business services
  modules.BillingService.init();
  modules.initializeAccountingListeners();

  // 4. Initialize marketing automation
  modules.setupMarketingEventBridge();
  modules.initConnectEventBridge();

  // Async initializations - tolerate Redis being offline
  try {
    await Promise.all([
      modules.initMarketingQueues(),
      modules.setupWorkflowWorker(),
      modules.initMarketingWorkers(),
      modules.AutomationRuleEngine.initialize(),
      modules.QueueMonitorService.init(),
    ]);
    console.log('📬 [SkillsLayer] Queue subsystems ready.');
  } catch (err: any) {
    console.warn('[SkillsLayer] Queue init warning:', err?.message);
  }

  // 5. Log final status
  const status = modules.getAutomationListenerStatus();
  console.log('\n📊 [SkillsLayer] Status:');
  console.log(`   - Mapped events: ${status.mappedEvents.length}`);
  console.log(`   - Active listeners: ${status.eventBusListenerCount}`);

  console.log('\n✅ [SkillsLayer] Initialization complete');
  console.log('🚀 ========================================\n');

  initialized = true;
}

// Auto-initialize when imported in server environment
if (typeof window === 'undefined') {
  initializeSkillsLayer().catch(console.error);
}

// Export for explicit use
export { eventBus };
export { initializeAutomationListeners, getAutomationListenerStatus } from './automation-listener';
export * from './index';