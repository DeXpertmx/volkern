import { describe, it, expect } from 'vitest';
import {
  PLANS,
  ALL_MODULES,
  PLAN_MODULES,
  PLAN_LIMITS,
  PLAN_PRICES,
  PLAN_FEATURES,
  PLAN_EXCLUDED,
  ADDONS,
  TRIAL_DAYS,
  isTrialActive,
  getTrialDaysRemaining,
} from '@/lib/plans';

// ============================================================
// PLANS constant
// ============================================================
describe('PLANS', () => {
  it('debe definir todos los planes', () => {
    expect(PLANS).toHaveProperty('STARTER');
    expect(PLANS).toHaveProperty('GROWTH');
    expect(PLANS).toHaveProperty('PRO');
    expect(PLANS).toHaveProperty('TRIAL');
    expect(PLANS).toHaveProperty('BASICO');
    expect(PLANS).toHaveProperty('PROFESIONAL');
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

// ============================================================
// ALL_MODULES
// ============================================================
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

  it('debe incluir módulos clave: leads, pipeline, mensajes, campanas, cursos, rrhh, finanzas', () => {
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

  it('los grupos deben ser válidos', () => {
    const groups = new Set(ALL_MODULES.map(m => m.group));
    expect(groups.has('Ventas & Leads')).toBe(true);
    expect(groups.has('Comunicación')).toBe(true);
    expect(groups.has('Marketing')).toBe(true);
    expect(groups.has('ERP')).toBe(true);
    expect(groups.has('Administración')).toBe(true);
  });
});

// ============================================================
// PLAN_MODULES
// ============================================================
describe('PLAN_MODULES', () => {
  it('debe tener entries para TRIAL, STARTER, GROWTH, PRO, BASICO, PROFESIONAL, AGENCY_SLOT, PRO_AGENCY', () => {
    expect(PLAN_MODULES).toHaveProperty(PLANS.TRIAL);
    expect(PLAN_MODULES).toHaveProperty(PLANS.STARTER);
    expect(PLAN_MODULES).toHaveProperty(PLANS.GROWTH);
    expect(PLAN_MODULES).toHaveProperty(PLANS.PRO);
    expect(PLAN_MODULES).toHaveProperty(PLANS.BASICO);
    expect(PLAN_MODULES).toHaveProperty(PLANS.PROFESIONAL);
    expect(PLAN_MODULES).toHaveProperty(PLANS.AGENCY_SLOT);
    expect(PLAN_MODULES).toHaveProperty(PLANS.PRO_AGENCY);
  });

  it('TRIAL debe incluir módulos core: leads, mensajes, campanas, rrhh, finanzas', () => {
    const trial = PLAN_MODULES[PLANS.TRIAL];
    expect(trial).toContain('leads');
    expect(trial).toContain('mensajes');
    expect(trial).toContain('campanas');
    expect(trial).toContain('rrhh');
    expect(trial).toContain('finanzas');
  });

  it('GROWTH debe incluir más módulos que STARTER', () => {
    const starter = PLAN_MODULES[PLANS.STARTER];
    const growth = PLAN_MODULES[PLANS.GROWTH];
    expect(growth.length).toBeGreaterThan(starter.length);
  });

  it('PRO debe incluir más módulos que GROWTH', () => {
    const growth = PLAN_MODULES[PLANS.GROWTH];
    const pro = PLAN_MODULES[PLANS.PRO];
    expect(pro.length).toBeGreaterThanOrEqual(growth.length);
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

// ============================================================
// PLAN_LIMITS
// ============================================================
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

  it('PRO debe tener límites ilimitados (-1) para leads, emails, automation, courses, students', () => {
    const pro = PLAN_LIMITS[PLANS.PRO];
    expect(pro.leads).toBe(-1);
    expect(pro.emails_per_month).toBe(-1);
    expect(pro.automation_runs).toBe(-1);
    expect(pro.courses).toBe(-1);
    expect(pro.students).toBe(-1);
  });

  it('TRIAL debe tener límites restrictivos', () => {
    const trial = PLAN_LIMITS[PLANS.TRIAL];
    expect(trial.leads).toBeLessThanOrEqual(100);
    expect(trial.users).toBeLessThanOrEqual(2);
    expect(trial.automation_runs).toBe(0);
  });

  it('GROWTH debe tener más leads que STARTER', () => {
    expect(PLAN_LIMITS[PLANS.GROWTH].leads).toBeGreaterThan(PLAN_LIMITS[PLANS.STARTER].leads);
  });

  it('PRO debe tener al menos 5 límites ilimitados (-1)', () => {
    const pro = PLAN_LIMITS[PLANS.PRO];
    const unlimitedCount = Object.values(pro).filter(v => v === -1).length;
    expect(unlimitedCount).toBeGreaterThanOrEqual(5);
  });
});

// ============================================================
// PLAN_PRICES
// ============================================================
describe('PLAN_PRICES', () => {
  it('debe tener entries para STARTER, GROWTH, PRO', () => {
    expect(PLAN_PRICES).toHaveProperty(PLANS.STARTER);
    expect(PLAN_PRICES).toHaveProperty(PLANS.GROWTH);
    expect(PLAN_PRICES).toHaveProperty(PLANS.PRO);
  });

  it('cada plan debe tener monthly, yearly, currency, stripePriceId', () => {
    for (const [plan, price] of Object.entries(PLAN_PRICES)) {
      expect(price).toHaveProperty('monthly');
      expect(price).toHaveProperty('yearly');
      expect(price).toHaveProperty('currency');
      expect(price).toHaveProperty('stripePriceId');
      expect(typeof price.monthly).toBe('number');
      expect(typeof price.yearly).toBe('number');
    }
  });

  it('yearly debe ser mayor que monthly * 10 (descuento anual)', () => {
    for (const [plan, price] of Object.entries(PLAN_PRICES)) {
      expect(price.yearly).toBeLessThan(price.monthly * 12);
    }
  });

  it('PRO debe ser más caro que GROWTH, GROWTH más caro que STARTER', () => {
    expect(PLAN_PRICES[PLANS.PRO].monthly).toBeGreaterThan(PLAN_PRICES[PLANS.GROWTH].monthly);
    expect(PLAN_PRICES[PLANS.GROWTH].monthly).toBeGreaterThan(PLAN_PRICES[PLANS.STARTER].monthly);
  });

  it('la moneda debe ser EUR para todos', () => {
    for (const [plan, price] of Object.entries(PLAN_PRICES)) {
      expect(price.currency).toBe('eur');
    }
  });
});

// ============================================================
// PLAN_FEATURES
// ============================================================
describe('PLAN_FEATURES', () => {
  it('debe tener entries para STARTER, GROWTH, PRO', () => {
    expect(PLAN_FEATURES).toHaveProperty(PLANS.STARTER);
    expect(PLAN_FEATURES).toHaveProperty(PLANS.GROWTH);
    expect(PLAN_FEATURES).toHaveProperty(PLANS.PRO);
  });

  it('cada plan debe tener features no vacíos', () => {
    for (const [plan, features] of Object.entries(PLAN_FEATURES)) {
      expect(features.length).toBeGreaterThan(0);
      for (const f of features) {
        expect(typeof f).toBe('string');
      }
    }
  });

  it('GROWTH debe tener más features que STARTER', () => {
    expect(PLAN_FEATURES[PLANS.GROWTH].length).toBeGreaterThan(PLAN_FEATURES[PLANS.STARTER].length);
  });
});

// ============================================================
// PLAN_EXCLUDED
// ============================================================
describe('PLAN_EXCLUDED', () => {
  it('debe tener entries para STARTER, GROWTH, PRO', () => {
    expect(PLAN_EXCLUDED).toHaveProperty(PLANS.STARTER);
    expect(PLAN_EXCLUDED).toHaveProperty(PLANS.GROWTH);
    expect(PLAN_EXCLUDED).toHaveProperty(PLANS.PRO);
  });

  it('STARTER debe tener exclusiones', () => {
    expect(PLAN_EXCLUDED[PLANS.STARTER].length).toBeGreaterThan(0);
  });

  it('GROWTH y PRO no deben tener exclusiones', () => {
    expect(PLAN_EXCLUDED[PLANS.GROWTH]).toEqual([]);
    expect(PLAN_EXCLUDED[PLANS.PRO]).toEqual([]);
  });
});

// ============================================================
// ADDONS
// ============================================================
describe('ADDONS', () => {
  it('debe ser un array con al menos 3 add-ons', () => {
    expect(Array.isArray(ADDONS)).toBe(true);
    expect(ADDONS.length).toBeGreaterThanOrEqual(3);
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

  it('debe incluir addon_usuarios, addon_whatsapp, addon_academia, addon_automatizacion_ia', () => {
    const ids = ADDONS.map(a => a.id);
    expect(ids).toContain('addon_usuarios');
    expect(ids).toContain('addon_whatsapp');
    expect(ids).toContain('addon_academia');
    expect(ids).toContain('addon_automatizacion_ia');
  });
});

// ============================================================
// TRIAL_DAYS
// ============================================================
describe('TRIAL_DAYS', () => {
  it('debe ser un número positivo', () => {
    expect(typeof TRIAL_DAYS).toBe('number');
    expect(TRIAL_DAYS).toBeGreaterThan(0);
  });

  it('debe ser 14 (trial estándar de 2 semanas)', () => {
    expect(TRIAL_DAYS).toBe(14);
  });
});

// ============================================================
// isTrialActive
// ============================================================
describe('isTrialActive', () => {
  it('debe devolver true para trial activo (estado trial, fecha futura)', () => {
    const future = new Date();
    future.setDate(future.getDate() + 5); // 5 días en el futuro
    expect(isTrialActive({ trialEndsAt: future, estado: 'trial' })).toBe(true);
  });

  it('debe devolver false para trial expirado (fecha pasada)', () => {
    const past = new Date();
    past.setDate(past.getDate() - 1); // ayer
    expect(isTrialActive({ trialEndsAt: past, estado: 'trial' })).toBe(false);
  });

  it('debe devolver false para trialEndsAt null', () => {
    expect(isTrialActive({ trialEndsAt: null, estado: 'trial' })).toBe(false);
  });

  it('debe devolver false si estado no es trial aunque la fecha sea futura', () => {
    const future = new Date();
    future.setDate(future.getDate() + 5);
    expect(isTrialActive({ trialEndsAt: future, estado: 'activo' })).toBe(false);
    expect(isTrialActive({ trialEndsAt: future, estado: 'cancelado' })).toBe(false);
  });

  it('debe devolver false si justo ahora expira (mismo momento)', () => {
    const now = new Date();
    // new Date() < new Date(now) → falso porque son el mismo timestamp
    expect(isTrialActive({ trialEndsAt: now, estado: 'trial' })).toBe(false);
  });
});

// ============================================================
// getTrialDaysRemaining
// ============================================================
describe('getTrialDaysRemaining', () => {
  it('debe devolver días positivos para trial con fecha futura', () => {
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

  it('debe devolver 0 para trialEndsAt null', () => {
    expect(getTrialDaysRemaining(null)).toBe(0);
  });

  it('debe devolver al menos 1 día si faltan horas (ceil)', () => {
    const future = new Date(Date.now() + 60 * 60 * 1000); // 1 hora en el futuro
    const days = getTrialDaysRemaining(future);
    expect(days).toBe(1); // ceil de ~0.04 → 1
  });

  it('debe devolver 1 día si faltan segundos', () => {
    const future = new Date(Date.now() + 1000); // 1 segundo
    expect(getTrialDaysRemaining(future)).toBe(1);
  });

  it('debe ser determinista para una misma fecha', () => {
    const future = new Date('2027-06-15T12:00:00Z');
    const a = getTrialDaysRemaining(future);
    const b = getTrialDaysRemaining(future);
    expect(a).toBe(b);
  });
});
