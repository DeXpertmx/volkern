import { describe, it, expect } from 'vitest';
import {
  PLANS,
  ALL_MODULES,
  PLAN_MODULES,
  PLAN_LIMITS,
  PLAN_PRICES,
  PLAN_FEATURES,
  ADDONS,
  TRIAL_DAYS,
  isTrialActive,
  getTrialDaysRemaining,
} from '@/lib/plans';

describe('PLANS', () => {
  it('debe definir todos los planes', () => {
    expect(PLANS).toHaveProperty('ESENCIAL');
    expect(PLANS).toHaveProperty('PROFESIONAL');
    expect(PLANS).toHaveProperty('INFINITY');
    expect(PLANS).toHaveProperty('TRIAL');
    expect(PLANS).toHaveProperty('BASICO');
    expect(PLANS).toHaveProperty('AGENCY_SLOT');
    expect(PLANS).toHaveProperty('PRO_AGENCY');
  });

  it('todos los valores deben ser strings únicos', () => {
    const values = Object.values(PLANS);
    expect(new Set(values).size).toBe(values.length);
  });

  it('los valores deben ser slugs en lowercase', () => {
    for (const v of Object.values(PLANS)) {
      expect(v).toBe(v.toLowerCase());
      expect(v).not.toContain(' ');
    }
  });
});

describe('ALL_MODULES', () => {
  it('debe ser un array con al menos 40 módulos', () => {
    expect(Array.isArray(ALL_MODULES)).toBe(true);
    expect(ALL_MODULES.length).toBeGreaterThanOrEqual(40);
  });

  it('cada módulo debe tener id, label, description, icon, group', () => {
    for (const mod of ALL_MODULES) {
      expect(mod).toHaveProperty('id');
      expect(mod).toHaveProperty('label');
      expect(mod).toHaveProperty('description');
      expect(mod).toHaveProperty('icon');
      expect(mod).toHaveProperty('group');
      expect(typeof mod.id).toBe('string');
      expect(typeof mod.label).toBe('string');
      expect(typeof mod.group).toBe('string');
    }
  });

  it('los IDs de módulos deben ser únicos', () => {
    const ids = ALL_MODULES.map(m => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('debe incluir módulos clave', () => {
    const ids = ALL_MODULES.map(m => m.id);
    expect(ids).toContain('leads');
    expect(ids).toContain('pipeline');
    expect(ids).toContain('mensajes');
    expect(ids).toContain('campanas');
    expect(ids).toContain('cursos');
    expect(ids).toContain('rrhh');
    expect(ids).toContain('finanzas');
    expect(ids).toContain('inventario');
    expect(ids).toContain('produccion');
    expect(ids).toContain('estrategia');
  });
});

describe('PLAN_MODULES', () => {
  it('debe tener entries para todos los planes', () => {
    for (const key of Object.values(PLANS)) {
      expect(PLAN_MODULES).toHaveProperty(key);
    }
  });

  it('Esencial, Profesional e Infinity deben tener el mismo set completo de módulos', () => {
    const esencial = new Set(PLAN_MODULES[PLANS.ESENCIAL]);
    const profesional = new Set(PLAN_MODULES[PLANS.PROFESIONAL]);
    const infinity = new Set(PLAN_MODULES[PLANS.INFINITY]);
    expect(esencial).toEqual(profesional);
    expect(profesional).toEqual(infinity);
    expect(esencial.size).toBeGreaterThan(50);
  });

  it('PRO_AGENCY debe incluir white_label y custom_domain', () => {
    const proAgency = PLAN_MODULES[PLANS.PRO_AGENCY];
    expect(proAgency).toContain('white_label');
    expect(proAgency).toContain('custom_domain');
    expect(proAgency).toContain('agency');
  });

  it('todos los módulos en PLAN_MODULES deben ser IDs válidos de ALL_MODULES', () => {
    const validIds = new Set(ALL_MODULES.map(m => m.id));
    for (const [plan, modules] of Object.entries(PLAN_MODULES)) {
      for (const mod of modules) {
        expect(validIds.has(mod)).toBe(true);
      }
    }
  });

  it('cada plan debe tener módulos únicos (sin duplicados)', () => {
    for (const [plan, modules] of Object.entries(PLAN_MODULES)) {
      expect(new Set(modules).size).toBe(modules.length);
    }
  });
});

describe('PLAN_LIMITS', () => {
  it('debe tener entries para todos los planes', () => {
    for (const v of Object.values(PLANS)) {
      expect(PLAN_LIMITS).toHaveProperty(v);
    }
  });

  it('cada plan debe tener al menos leads, users, storage_gb', () => {
    for (const [plan, limits] of Object.entries(PLAN_LIMITS)) {
      expect(limits).toHaveProperty('leads');
      expect(limits).toHaveProperty('users');
      expect(limits).toHaveProperty('storage_gb');
    }
  });

  it('los límites deben escalar: Esencial < Profesional < Infinity', () => {
    const esencial = PLAN_LIMITS[PLANS.ESENCIAL];
    const profesional = PLAN_LIMITS[PLANS.PROFESIONAL];
    const infinity = PLAN_LIMITS[PLANS.INFINITY];
    expect(esencial.leads).toBeLessThan(profesional.leads);
    expect(esencial.users).toBeLessThan(profesional.users);
    expect(esencial.storage_gb).toBeLessThan(profesional.storage_gb);
    expect(profesional.leads).toBeLessThan(infinity.leads === -1 ? 999999 : infinity.leads);
    expect(profesional.users).toBeLessThan(infinity.users === -1 ? 999999 : infinity.users);
  });

  it('Infinity debe tener leads, emails, courses ilimitados (-1)', () => {
    expect(PLAN_LIMITS[PLANS.INFINITY].leads).toBe(-1);
    expect(PLAN_LIMITS[PLANS.INFINITY].emails_per_month).toBe(-1);
    expect(PLAN_LIMITS[PLANS.INFINITY].courses).toBe(-1);
    expect(PLAN_LIMITS[PLANS.INFINITY].automations_count).toBe(-1);
  });

  it('TRIAL debe tener límites restrictivos', () => {
    const trial = PLAN_LIMITS[PLANS.TRIAL];
    expect(trial.leads).toBeLessThanOrEqual(100);
    expect(trial.users).toBeLessThanOrEqual(2);
    expect(trial.automation_runs).toBe(0);
  });
});

describe('PLAN_PRICES', () => {
  it('debe tener entries para Esencial, Profesional, Infinity', () => {
    expect(PLAN_PRICES[PLANS.ESENCIAL]).toBeDefined();
    expect(PLAN_PRICES[PLANS.PROFESIONAL]).toBeDefined();
    expect(PLAN_PRICES[PLANS.INFINITY]).toBeDefined();
  });

  it('los precios deben ser correctos', () => {
    expect(PLAN_PRICES[PLANS.ESENCIAL].monthly).toBe(69);
    expect(PLAN_PRICES[PLANS.ESENCIAL].yearly).toBe(662);
    expect(PLAN_PRICES[PLANS.PROFESIONAL].monthly).toBe(149);
    expect(PLAN_PRICES[PLANS.PROFESIONAL].yearly).toBe(1430);
    expect(PLAN_PRICES[PLANS.INFINITY].monthly).toBe(299);
    expect(PLAN_PRICES[PLANS.INFINITY].yearly).toBe(2870);
  });

  it('cada plan debe tener monthly, yearly, currency, stripePriceId, stripePriceYearlyId', () => {
    for (const price of Object.values(PLAN_PRICES)) {
      expect(typeof price.monthly).toBe('number');
      expect(typeof price.yearly).toBe('number');
      expect(price.currency).toBe('eur');
      expect(price.stripePriceId).toBeDefined();
      expect(price.stripePriceYearlyId).toBeDefined();
    }
  });

  it('yearly debe ser menor que monthly * 12 (descuento anual ~20%)', () => {
    for (const price of Object.values(PLAN_PRICES)) {
      expect(price.yearly).toBeLessThan(price.monthly * 12);
      const discount = 1 - (price.yearly / (price.monthly * 12));
      expect(discount).toBeGreaterThanOrEqual(0.19);
      expect(discount).toBeLessThanOrEqual(0.21);
    }
  });

  it('Infinity debe ser más caro que Profesional, Profesional más caro que Esencial', () => {
    expect(PLAN_PRICES[PLANS.INFINITY].monthly).toBeGreaterThan(PLAN_PRICES[PLANS.PROFESIONAL].monthly);
    expect(PLAN_PRICES[PLANS.PROFESIONAL].monthly).toBeGreaterThan(PLAN_PRICES[PLANS.ESENCIAL].monthly);
  });
});

describe('PLAN_FEATURES', () => {
  it('debe tener entries para Esencial, Profesional, Infinity, TRIAL', () => {
    expect(PLAN_FEATURES[PLANS.ESENCIAL]).toBeDefined();
    expect(PLAN_FEATURES[PLANS.PROFESIONAL]).toBeDefined();
    expect(PLAN_FEATURES[PLANS.INFINITY]).toBeDefined();
    expect(PLAN_FEATURES[PLANS.TRIAL]).toBeDefined();
  });

  it('cada plan debe tener features no vacíos', () => {
    for (const features of Object.values(PLAN_FEATURES)) {
      expect(features.length).toBeGreaterThan(0);
      for (const f of features) {
        expect(typeof f).toBe('string');
      }
    }
  });

  it('Todos los planes deben tener features listados', () => {
    expect(PLAN_FEATURES[PLANS.ESENCIAL].length).toBeGreaterThan(0);
    expect(PLAN_FEATURES[PLANS.PROFESIONAL].length).toBeGreaterThan(0);
    expect(PLAN_FEATURES[PLANS.INFINITY].length).toBeGreaterThan(0);
  });
});

describe('ADDONS', () => {
  it('debe ser un array con al menos 1 add-on (solo usuarios extra)', () => {
    expect(Array.isArray(ADDONS)).toBe(true);
    expect(ADDONS.length).toBeGreaterThanOrEqual(1);
  });

  it('cada add-on debe tener id, nombre, descripcion, precio, moneda, intervalo, icon', () => {
    for (const addon of ADDONS) {
      expect(addon).toHaveProperty('id');
      expect(addon).toHaveProperty('nombre');
      expect(addon).toHaveProperty('descripcion');
      expect(addon).toHaveProperty('precio');
      expect(addon).toHaveProperty('moneda');
      expect(addon).toHaveProperty('intervalo');
      expect(addon).toHaveProperty('icon');
      expect(typeof addon.precio).toBe('number');
      expect(addon.precio).toBeGreaterThan(0);
    }
  });

  it('los IDs de add-ons deben ser únicos', () => {
    const ids = ADDONS.map(a => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('debe incluir addon_usuarios', () => {
    const ids = ADDONS.map(a => a.id);
    expect(ids).toContain('addon_usuarios');
  });
});

describe('TRIAL_DAYS', () => {
  it('debe ser 14', () => {
    expect(TRIAL_DAYS).toBe(14);
  });
});

describe('isTrialActive', () => {
  it('debe devolver true para trial activo', () => {
    const future = new Date();
    future.setDate(future.getDate() + 5);
    expect(isTrialActive({ trialEndsAt: future, estado: 'trial' })).toBe(true);
  });

  it('debe devolver false para trial expirado', () => {
    const past = new Date();
    past.setDate(past.getDate() - 1);
    expect(isTrialActive({ trialEndsAt: past, estado: 'trial' })).toBe(false);
  });

  it('debe devolver false para trialEndsAt null', () => {
    expect(isTrialActive({ trialEndsAt: null, estado: 'trial' })).toBe(false);
  });
});

describe('getTrialDaysRemaining', () => {
  it('debe devolver días positivos para trial activo', () => {
    const future = new Date();
    future.setDate(future.getDate() + 5);
    const days = getTrialDaysRemaining(future);
    expect(days).toBeGreaterThanOrEqual(3);
    expect(days).toBeLessThanOrEqual(7);
  });

  it('debe devolver 0 para trial expirado', () => {
    const past = new Date();
    past.setDate(past.getDate() - 5);
    expect(getTrialDaysRemaining(past)).toBe(0);
  });
});
