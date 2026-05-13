/**
 * Gemma AI Agent - Inicialización
 * 
 * Este archivo debe ser importado al inicio de la aplicación
 * para registrar los event handlers de Gemma.
 */

import { initGemmaChatbot } from './chatwoot-chatbot-handler';

// Inicializar Gemma cuando se cargue el módulo
console.log('[Gemma] Inicializando AI Agent...');

try {
  initGemmaChatbot();
  console.log('[Gemma] AI Agent listo para recibir mensajes');
} catch (error) {
  console.error('[Gemma] Error al inicializar:', error);
}

export { initGemmaChatbot } from './chatwoot-chatbot-handler';
export { linkTelegramToUser } from './chatwoot-chatbot-handler';
export { handleChatwootMessage } from './chatwoot-chatbot-handler';

// Re-exportar componentes del pipeline
export { GemmaRouterAgent } from './gemma-router';
export { SkillOrchestratorAgent } from './skill-orchestrator';
export { ExecutionEngine } from './execution-engine';
export { SkillRegistry } from './skill-registry';
export { ResponseFormatter } from './response-formatter';
export { ChatbotAuditLogger } from './audit-logger';
export { SecurityCheckpointAgent } from './security-checkpoint';