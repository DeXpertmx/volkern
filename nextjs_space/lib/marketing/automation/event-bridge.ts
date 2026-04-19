import { eventBus, EVENTS } from '../../skills/event-bus';
import { AutomationRuleEngine } from './rule-engine';

/**
 * Marketing Event Bridge
 * Escucha eventos del ERP y los envía al motor de automatización de marketing
 */
export const setupMarketingEventBridge = () => {
  console.log('[Marketing] Setting up Event Bridge...');

  // Lista de eventos que interesan a Marketing
  const marketingTriggers = [
    EVENTS.LEAD_CREATED,
    EVENTS.LEAD_QUALIFIED,
    EVENTS.DEAL_WON,
    EVENTS.PAYMENT_RECEIVED,
    EVENTS.CONTACT_CREATED,
    // Próximamente: STOCK_LOW, INVOICE_OVERDUE (deben ser emitidos por sus respectivos servicios)
  ];

  marketingTriggers.forEach(event => {
    eventBus.on(event, async (payload) => {
      console.log(`[Marketing Bridge] Received event: ${event} for tenant ${payload.tenantId}`);
      
      try {
        await AutomationRuleEngine.processEvent(event, payload);
      } catch (error) {
        console.error(`[Marketing Bridge] Error processing automation for ${event}:`, error);
      }
    });
  });

  // Escuchar también sumisiones de formularios de GrapesJS
  eventBus.on('form_submitted', async (payload) => {
    await AutomationRuleEngine.processEvent('form_submitted', payload);
  });
};
