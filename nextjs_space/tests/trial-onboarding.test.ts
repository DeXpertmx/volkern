import { describe, it, expect } from 'vitest';
import { TRIAL_FIRST_ACTIONS, isTrialFirstAction } from '@/lib/trial-onboarding';

// ============================================================
// TRIAL_FIRST_ACTIONS
// ============================================================
describe('TRIAL_FIRST_ACTIONS', () => {
  it('debe ser un array con al menos 8 acciones', () => {
    expect(Array.isArray(TRIAL_FIRST_ACTIONS)).toBe(true);
    expect(TRIAL_FIRST_ACTIONS.length).toBeGreaterThanOrEqual(8);
  });

  it('todas las acciones deben ser strings', () => {
    for (const action of TRIAL_FIRST_ACTIONS) {
      expect(typeof action).toBe('string');
      expect(action.length).toBeGreaterThan(0);
    }
  });

  it('debe incluir first_lead_created, first_contact_created, first_deal_created', () => {
    expect(TRIAL_FIRST_ACTIONS).toContain('first_lead_created');
    expect(TRIAL_FIRST_ACTIONS).toContain('first_contact_created');
    expect(TRIAL_FIRST_ACTIONS).toContain('first_deal_created');
  });

  it('debe incluir first_campaign_sent, first_automation_created', () => {
    expect(TRIAL_FIRST_ACTIONS).toContain('first_campaign_sent');
    expect(TRIAL_FIRST_ACTIONS).toContain('first_automation_created');
  });

  it('debe incluir onboarding_completed', () => {
    expect(TRIAL_FIRST_ACTIONS).toContain('onboarding_completed');
  });

  it('todas las acciones deben seguir el snake_case naming', () => {
    for (const action of TRIAL_FIRST_ACTIONS) {
      expect(action).toMatch(/^[a-z_]+$/);
    }
  });

  it('debe tener acciones únicas (sin duplicados)', () => {
    expect(new Set(TRIAL_FIRST_ACTIONS).size).toBe(TRIAL_FIRST_ACTIONS.length);
  });
});

// ============================================================
// isTrialFirstAction
// ============================================================
describe('isTrialFirstAction', () => {
  it('debe devolver true para first_lead_created', () => {
    expect(isTrialFirstAction('first_lead_created')).toBe(true);
  });

  it('debe devolver true para first_contact_created', () => {
    expect(isTrialFirstAction('first_contact_created')).toBe(true);
  });

  it('debe devolver true para first_deal_created', () => {
    expect(isTrialFirstAction('first_deal_created')).toBe(true);
  });

  it('debe devolver true para first_campaign_sent', () => {
    expect(isTrialFirstAction('first_campaign_sent')).toBe(true);
  });

  it('debe devolver true para first_page_created', () => {
    expect(isTrialFirstAction('first_page_created')).toBe(true);
  });

  it('debe devolver true para onboarding_completed', () => {
    expect(isTrialFirstAction('onboarding_completed')).toBe(true);
  });

  it('debe devolver false para acción no registrada', () => {
    expect(isTrialFirstAction('random_action')).toBe(false);
    expect(isTrialFirstAction('')).toBe(false);
    expect(isTrialFirstAction('create_lead')).toBe(false);
  });

  it('cada acción de TRIAL_FIRST_ACTIONS debe ser reconocida', () => {
    for (const action of TRIAL_FIRST_ACTIONS) {
      expect(isTrialFirstAction(action)).toBe(true);
    }
  });

  it('debe ser determinista (misma entrada = misma salida)', () => {
    expect(isTrialFirstAction('first_lead_created')).toBe(isTrialFirstAction('first_lead_created'));
    expect(isTrialFirstAction('nonexistent')).toBe(isTrialFirstAction('nonexistent'));
  });
});
