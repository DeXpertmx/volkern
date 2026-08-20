import { describe, it, expect, beforeEach } from 'vitest';
import { ensureAutomationListeners, initializeAutomationListeners } from '@/lib/skills/automation-listener';
import { eventBus, EVENTS } from '@/lib/skills/event-bus';

describe('ensureAutomationListeners — registro idempotente en el bundle del emisor', () => {
  beforeEach(() => {
    // Reiniciar el guard del módulo para poder medir el registro. El flag se
    // resetea re-evaluando el módulo no es posible con vitest fácilmente, así
    // que medimos el conteo real de listeners del bus.
  });

  it('registra los listeners del EventBus (formulario_enviado incluido)', () => {
    ensureAutomationListeners();
    expect(eventBus.listenerCount(EVENTS.FORM_SUBMITTED)).toBeGreaterThan(0);
    expect(eventBus.listenerCount(EVENTS.LEAD_CREATED)).toBeGreaterThan(0);
  });

  it('es idempotente: llamadas repetidas no duplican listeners', () => {
    ensureAutomationListeners();
    const antes = eventBus.listenerCount(EVENTS.FORM_SUBMITTED);
    ensureAutomationListeners();
    ensureAutomationListeners();
    expect(eventBus.listenerCount(EVENTS.FORM_SUBMITTED)).toBe(antes);
  });

  it('initializeAutomationListeners sin guard duplicaría (documenta por qué existe ensure)', () => {
    ensureAutomationListeners();
    const antes = eventBus.listenerCount(EVENTS.FORM_SUBMITTED);
    // Este es el comportamiento peligroso que ensure evita: la función cruda
    // registra de nuevo. Solo lo documentamos para el test.
    initializeAutomationListeners();
    expect(eventBus.listenerCount(EVENTS.FORM_SUBMITTED)).toBe(antes * 2);
  });
});
