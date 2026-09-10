import { eventBus, EVENTS } from '../skills/event-bus';
import { AutomationRuleEngine } from '../marketing/automation/rule-engine';

/**
 * Hospitality Event Bridge (plan maestro §22).
 *
 * Conecta los eventos de Hospitality al Automation Engine existente de
 * Volkern: cada evento emitido por webhooks/operaciones se envía al
 * AutomationRuleEngine, que busca reglas activas del tenant para ese
 * trigger, evalúa condiciones y encola las acciones (BullMQ worker).
 *
 * NO duplica el motor de automatización: solo registra listeners, igual
 * que setupMarketingEventBridge lo hace para Marketing. El event bus es
 * en memoria; este bridge debe registrarse en el mismo proceso que
 * atiende los requests (instrumentation.ts).
 */
export const setupHospitalityEventBridge = () => {
  console.log('[Hospitality] Setting up Event Bridge...');

  const hospitalityTriggers = [
    EVENTS.HOSPITALITY_RESERVATION_CREATED,
    EVENTS.HOSPITALITY_RESERVATION_MODIFIED,
    EVENTS.HOSPITALITY_RESERVATION_CANCELLED,
    EVENTS.HOSPITALITY_RESERVATION_CHECKED_IN,
    EVENTS.HOSPITALITY_RESERVATION_CHECKED_OUT,
    EVENTS.HOSPITALITY_CHECKIN_DUE,
    EVENTS.HOSPITALITY_CLEANING_COMPLETED,
    EVENTS.HOSPITALITY_MAINTENANCE_CREATED,
    EVENTS.HOSPITALITY_MAINTENANCE_COMPLETED,
  ];

  hospitalityTriggers.forEach((event) => {
    eventBus.on(event, async (payload) => {
      console.log(`[Hospitality Bridge] Received event: ${event} for tenant ${payload.tenantId}`);
      try {
        await AutomationRuleEngine.processEvent(event, payload);
      } catch (error) {
        console.error(`[Hospitality Bridge] Error processing automation for ${event}:`, error);
      }
    });
  });
};