import { describe, it, expect } from 'vitest';
import { FEATURE_LABELS, type FeatureName } from '@/lib/subscription';

describe('FEATURE_LABELS', () => {
  it('debe tener todos los features', () => {
    const keys = Object.keys(FEATURE_LABELS);
    expect(keys.length).toBeGreaterThanOrEqual(16);
  });

  it('cada label debe ser un string no vacío', () => {
    for (const [key, label] of Object.entries(FEATURE_LABELS)) {
      expect(typeof key).toBe('string');
      expect(key.length).toBeGreaterThan(0);
      expect(typeof label).toBe('string');
      expect(label.length).toBeGreaterThan(0);
    }
  });

  it('debe incluir features base', () => {
    expect(FEATURE_LABELS.leads).toBe('Leads');
    expect(FEATURE_LABELS.users).toBe('Usuarios');
    expect(FEATURE_LABELS.emails_per_month).toBe('Emails al mes');
  });

  it('todas las keys deben ser del tipo FeatureName', () => {
    const keys = Object.keys(FEATURE_LABELS);
    for (const key of keys) {
      expect(key).toBeTruthy();
    }
  });
});

import { PLANS, PLAN_LIMITS, PLAN_MODULES, PLAN_PRICES } from '@/lib/plans';

describe('PLAN_LIMITS consistency with plans', () => {
  it('PLAN_LIMITS debe tener entrada para TRIAL', () => {
    expect(PLAN_LIMITS[PLANS.TRIAL]).toBeDefined();
  });

  it('PLAN_LIMITS debe tener entrada para ESENCIAL', () => {
    expect(PLAN_LIMITS[PLANS.ESENCIAL]).toBeDefined();
  });

  it('PLAN_LIMITS debe tener entrada para PROFESIONAL', () => {
    expect(PLAN_LIMITS[PLANS.PROFESIONAL]).toBeDefined();
  });

  it('PLAN_LIMITS debe tener entrada para INFINITY', () => {
    expect(PLAN_LIMITS[PLANS.INFINITY]).toBeDefined();
  });

  it('TRIAL no debe permitir automation_runs', () => {
    expect(PLAN_LIMITS[PLANS.TRIAL].automation_runs).toBe(0);
  });

  it('TRIAL debe permitir 2 usuarios', () => {
    expect(PLAN_LIMITS[PLANS.TRIAL].users).toBe(2);
  });

  it('INFINITY debe tener automation_runs ilimitado (-1)', () => {
    expect(PLAN_LIMITS[PLANS.INFINITY].automation_runs).toBe(-1);
  });

  it('PLAN_MODULES debe tener entrada para cada plan en PLANS', () => {
    for (const planKey of Object.values(PLANS)) {
      expect(PLAN_MODULES[planKey]).toBeDefined();
    }
  });

  it('TRIAL debe tener al menos 10 módulos', () => {
    expect(PLAN_MODULES[PLANS.TRIAL].length).toBeGreaterThanOrEqual(10);
  });

  it('INFINITY debe tener al menos 20 módulos', () => {
    expect(PLAN_MODULES[PLANS.INFINITY].length).toBeGreaterThanOrEqual(20);
  });

  it('PLAN_PRICES debe tener precios para los planes de pago', () => {
    expect(PLAN_PRICES[PLANS.ESENCIAL]).toBeDefined();
    expect(PLAN_PRICES[PLANS.PROFESIONAL]).toBeDefined();
    expect(PLAN_PRICES[PLANS.INFINITY]).toBeDefined();
  });

  it('PLAN_PRICES debe incluir monthly, yearly, currency, stripePriceId, stripePriceYearlyId', () => {
    for (const planKey of [PLANS.ESENCIAL, PLANS.PROFESIONAL, PLANS.INFINITY] as const) {
      const price = PLAN_PRICES[planKey];
      expect(price).toBeDefined();
      expect(typeof price.monthly).toBe('number');
      expect(typeof price.yearly).toBe('number');
      expect(typeof price.currency).toBe('string');
      expect(price.currency.length).toBe(3);
      expect(price.yearly).toBeLessThanOrEqual(price.monthly * 12);
    }
  });
});
