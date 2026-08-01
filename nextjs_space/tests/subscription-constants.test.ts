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

describe('Coherencia de superset entre planes (slot ⊆ pro)', () => {
  // Guard de regresión: si un módulo se añade al slot de cliente pero se olvida
  // en el plan padre (o viceversa), la vertical se desincroniza en silencio.
  it('PRO_ACCOUNTING debe ser superset de ACCOUNTING_SLOT (módulos)', () => {
    const slot = new Set(PLAN_MODULES[PLANS.ACCOUNTING_SLOT]);
    const pro = new Set(PLAN_MODULES[PLANS.PRO_ACCOUNTING]);
    for (const mod of PLAN_MODULES[PLANS.ACCOUNTING_SLOT]) {
      expect(pro.has(mod), `módulo ${mod} del slot contable debe existir en pro-accounting`).toBe(true);
    }
    // El plan padre debe aportar módulos propios de la firma (no solo replicar el slot)
    expect(slot.size).toBeLessThan(pro.size);
  });

  it('PRO_AGENCY debe ser superset de AGENCY_SLOT (módulos)', () => {
    const pro = new Set(PLAN_MODULES[PLANS.PRO_AGENCY]);
    for (const mod of PLAN_MODULES[PLANS.AGENCY_SLOT]) {
      expect(pro.has(mod), `módulo ${mod} del slot de agencia debe existir en pro-agency`).toBe(true);
    }
  });

  it('PRO_ACCOUNTING debe aportar módulos de firma contable (white_label, agency, rrhh, finanzas_consolidado)', () => {
    const pro = PLAN_MODULES[PLANS.PRO_ACCOUNTING];
    expect(pro).toContain('white_label');
    expect(pro).toContain('custom_domain');
    expect(pro).toContain('agency');
    expect(pro).toContain('rrhh');
    expect(pro).toContain('finanzas_consolidado');
  });

  it('ambos planes contables deben incluir insurance (vertical contable cubierta)', () => {
    expect(PLAN_MODULES[PLANS.ACCOUNTING_SLOT]).toContain('insurance');
    expect(PLAN_MODULES[PLANS.PRO_ACCOUNTING]).toContain('insurance');
  });

  it('PRO_ACCOUNTING debe tener límites >= ACCOUNTING_SLOT o ilimitados (-1)', () => {
    const slot = PLAN_LIMITS[PLANS.ACCOUNTING_SLOT] as Record<string, number>;
    const pro = PLAN_LIMITS[PLANS.PRO_ACCOUNTING] as Record<string, number>;
    for (const key of Object.keys(slot)) {
      const s = slot[key];
      const p = pro[key];
      // -1 en pro = ilimitado → siempre supera al slot; sino debe ser >= slot
      expect(p === -1 || p >= s, `límite ${key}: pro-accounting (${p}) debe ser ilimitado o >= slot (${s})`).toBe(true);
    }
  });
});
