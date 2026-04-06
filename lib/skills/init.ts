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

// Evitar múltiples inicializaciones
let initialized = false;

export function initializeSkillsLayer(): void {
  if (initialized) {
    console.log('🟡 [SkillsLayer] Ya está inicializado, omitiendo...');
    return;
  }

  console.log('\n🚀 ========================================');
  console.log('🚀 VOLKERN SKILLS LAYER - INICIALIZANDO');
  console.log('🚀 ========================================\n');

  // 1. Verificar EventBus
  console.log('✅ [SkillsLayer] EventBus singleton activo');

  // 2. Inicializar listeners de automatización
  initializeAutomationListeners();

  // 3. Log estado final
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
