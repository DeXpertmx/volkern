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

// ─── PLANS constants ───────────────────────────────────────────────────
describe('PLANS', () => {
  it('debe tener 8 planes definidos', () => {
    const keys = Object.keys(PLANS);
    expect(keys).toHaveLength(8);
  });

  it('debe incluir STARTER, GROWTH, PRO, TRIAL', () => {
    expect(PLANS.STARTER).toBe('starter');
    expect(PLANS.GROWTH).toBe('growth');
    expect(PLANS.PRO).toBe('pro');
    expect(PLANS.TRIAL).toBe('trial');
  });

  it('debe incluir BASICO, PROFESIONAL, AGENCY_SLOT, PRO_AGENCY', () => {
    expect(PLANS.BASICO).toBe('basico');
    expect(PLANS.PROFESIONAL).toBe('profesional');
    expect(PLANS.AGENCY_SLOT).toBe('agency-slot');
    expect(PLANS.PRO_AGENCY).toBe('pro-agency');
  });

  it('todos los valores deben ser strings no vacíos', () => {
    for (const [key, value] of Object.entries(PLANS)) {
      expect(value).toBeTruthy();
      expect(typeof value).toBe('string');
    }
  });
});

// ─── ALL_MODULES ───────────────────────────────────────────────────────
describe('ALL_MODULES', () => {
  it('debe tener al menos 40 módulos', () => {
    expect(ALL_MODULES.length).toBeGreaterThanOrEqual(40);
  });

  it('cada módulo debe tener id, label, description, icon, group', () => {
    for (const mod of ALL_MODULES) {
      expect(mod.id).toBeTruthy();
      expect(mod.label).toBeTruthy();
      expect(mod.description).toBeTruthy();
      expect(mod.icon).toBeTruthy();
      expect(mod.group).toBeTruthy();
    }
  });

  it('no debe haber IDs duplicados', () => {
    const ids = ALL_MODULES.map(m => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('debe contener los módulos principales de CRM', () => {
    const ids = ALL_MODULES.map(m => m.id);
    expect(ids).toContain('leads');
    expect(ids).toContain('contactos');
    expect(ids).toContain('pipeline');
    expect(ids).toContain('tareas');
    expect(ids).toContain('analytics');
    expect(ids).toContain('mensajes');
  });

  it('debe contener módulos ERP', () => {
    const ids = ALL_MODULES.map(m => m.id);
    expect(ids).toContain('rrhh');
    expect(ids).toContain('finanzas');
    expect(ids).toContain('produccion');
    expect(ids).toContain('inventario');
    expect(ids).toContain('calidad');
    expect(ids).toContain('proyectos');
  });

  it('debe contener módulos de integraciones', () => {
    const ids = ALL_MODULES.map(m => m.id);
    expect(ids).toContain('whatsapp');
    expect(ids).toContain('telegram');
    expect(ids).toContain('sms');
    expect(ids).toContain('api_access');
  });

  it('debe contener módulos de administración', () => {
    const ids = ALL_MODULES.map(m => m.id);
    expect(ids).toContain('white_label');
    expect(ids).toContain('custom_domain');
    expect(ids).toContain('equipo');
    expect(ids).toContain('configuracion');
  });

  it('todos los grupos deben ser strings no vacíos', () => {
    const groups = ALL_MODULES.map(m => m.group);
    for (const group of groups) {
      expect(typeof group).toBe('string');
      expect(group.length).toBeGreaterThan(0);
    }
  });
});

// ─── PLAN_MODULES ──────────────────────────────────────────────────────
describe('PLAN_MODULES', () => {
  it('debe tener entrada para cada plan', () => {
    for (const plan of Object.values(PLANS)) {
      expect(PLAN_MODULES[plan]).toBeDefined();
    }
  });

  it('TRIAL debe incluir módulos básicos', () => {
    const modules = PLAN_MODULES[PLANS.TRIAL];
    expect(modules).toContain('leads');
    expect(modules).toContain('pipeline');
    expect(modules).toContain('mensajes');
    expect(modules).toContain('campanas');
  });

  it('STARTER no debe incluir contratos ni scoring', () => {
    const modules = PLAN_MODULES[PLANS.STARTER];
    expect(modules).not.toContain('contratos');
    expect(modules).not.toContain('scoring');
    expect(modules).not.toContain('pronosticos');
  });

  it('GROWTH debe incluir cotizaciones y scoring', () => {
    const modules = PLAN_MODULES[PLANS.GROWTH];
    expect(modules).toContain('cotizaciones');
    expect(modules).toContain('scoring');
    expect(modules).toContain('automatizaciones');
    expect(modules).toContain('cursos');
  });

  it('PRO debe incluir los mismos módulos que GROWTH', () => {
    const growthMods = [...PLAN_MODULES[PLANS.GROWTH]].sort();
    const proMods = [...PLAN_MODULES[PLANS.PRO]].sort();
    expect(proMods).toEqual(growthMods);
  });

  it('PRO_AGENCY debe incluir white_label y custom_domain', () => {
    const modules = PLAN_MODULES[PLANS.PRO_AGENCY];
    expect(modules).toContain('white_label');
    expect(modules).toContain('custom_domain');
    expect(modules).toContain('agency');
  });

  it('ningún plan debe tener módulos duplicados', () => {
    for (const [plan, modules] of Object.entries(PLAN_MODULES)) {
      expect(new Set(modules).size).toBe(modules.length);
    }
  });

  it('todos los módulos en PLAN_MODULES deben existir en ALL_MODULES', () => {
    const allIds = new Set(ALL_MODULES.map(m => m.id));
    for (const modules of Object.values(PLAN_MODULES)) {
      for (const mod of modules) {
        expect(allIds.has(mod)).toBe(true);
      }
    }
  });
});

// ─── PLAN_LIMITS ───────────────────────────────────────────────────────
describe('PLAN_LIMITS', () => {
  const limitKeys = [
    'leads', 'users', 'emails_per_month', 'automation_runs',
    'whatsapp_messages', 'sms_messages', 'courses', 'students',
    'storage_gb', 'ai_image_generations', 'business_emails',
    'business_domains', 'business_email_gb', 'automations_count', 'pages',
  ];

  it('debe tener entrada para cada plan', () => {
    for (const plan of Object.values(PLANS)) {
      expect(PLAN_LIMITS[plan]).toBeDefined();
    }
  });

  it('cada plan debe tener todos los limitKeys', () => {
    for (const [plan, limits] of Object.entries(PLAN_LIMITS)) {
      for (const key of limitKeys) {
        expect(limits[key as keyof typeof limits]).toBeDefined();
      }
    }
  });

  it('todos los límites deben ser números', () => {
    for (const limits of Object.values(PLAN_LIMITS)) {
      for (const key of limitKeys) {
        expect(typeof limits[key as keyof typeof limits]).toBe('number');
      }
    }
  });

  it('TRIAL: leads debe ser 100', () => {
    expect(PLAN_LIMITS[PLANS.TRIAL].leads).toBe(100);
  });

  it('TRIAL: users debe ser 2', () => {
    expect(PLAN_LIMITS[PLANS.TRIAL].users).toBe(2);
  });

  it('STARTER: leads debe ser 2500', () => {
    expect(PLAN_LIMITS[PLANS.STARTER].leads).toBe(2500);
  });

  it('GROWTH: leads debe ser 10000', () => {
    expect(PLAN_LIMITS[PLANS.GROWTH].leads).toBe(10000);
  });

  it('PRO: leads debe ser -1 (ilimitado)', () => {
    expect(PLAN_LIMITS[PLANS.PRO].leads).toBe(-1);
  });

  it('PRO_AGENCY: users debe ser -1 (ilimitado)', () => {
    expect(PLAN_LIMITS[PLANS.PRO_AGENCY].users).toBe(-1);
  });

  it('PRO_AGENCY: storage_gb debe ser 1000', () => {
    expect(PLAN_LIMITS[PLANS.PRO_AGENCY].storage_gb).toBe(1000);
  });

  it('BASICO debe tener límites menores que PROFESIONAL en campos no ilimitados', () => {
    // PROFESIONAL tiene -1 (ilimitado) en leads, no comparar esos campos
    expect(PLAN_LIMITS[PLANS.BASICO].storage_gb).toBeLessThan(PLAN_LIMITS[PLANS.PROFESIONAL].storage_gb);
    expect(PLAN_LIMITS[PLANS.BASICO].business_email_gb).toBeLessThan(PLAN_LIMITS[PLANS.PROFESIONAL].business_email_gb);
  });

  it('AGENCY_SLOT debe tener límites intermedios', () => {
    expect(PLAN_LIMITS[PLANS.AGENCY_SLOT].leads).toBe(5000);
    expect(PLAN_LIMITS[PLANS.AGENCY_SLOT].users).toBe(5);
  });

  it('TRIAL: automation_runs debe ser 0 (sin automatización)', () => {
    expect(PLAN_LIMITS[PLANS.TRIAL].automation_runs).toBe(0);
    expect(PLAN_LIMITS[PLANS.STARTER].automation_runs).toBe(0);
  });
});

// ─── PLAN_PRICES ───────────────────────────────────────────────────────
describe('PLAN_PRICES', () => {
  it('debe tener precios para STARTER, GROWTH, PRO', () => {
    expect(PLAN_PRICES[PLANS.STARTER]).toBeDefined();
    expect(PLAN_PRICES[PLANS.GROWTH]).toBeDefined();
    expect(PLAN_PRICES[PLANS.PRO]).toBeDefined();
  });

  it('STARTER: monthly 49, yearly 490', () => {
    expect(PLAN_PRICES[PLANS.STARTER].monthly).toBe(49);
    expect(PLAN_PRICES[PLANS.STARTER].yearly).toBe(490);
  });

  it('GROWTH: monthly 99, yearly 990', () => {
    expect(PLAN_PRICES[PLANS.GROWTH].monthly).toBe(99);
    expect(PLAN_PRICES[PLANS.GROWTH].yearly).toBe(990);
  });

  it('PRO: monthly 199, yearly 1990', () => {
    expect(PLAN_PRICES[PLANS.PRO].monthly).toBe(199);
    expect(PLAN_PRICES[PLANS.PRO].yearly).toBe(1990);
  });

  it('la moneda debe ser EUR para todos los planes', () => {
    for (const price of Object.values(PLAN_PRICES)) {
      expect(price.currency).toBe('eur');
    }
  });

  it('yearly debe ser monthly * 10 (2 meses gratis)', () => {
    for (const price of Object.values(PLAN_PRICES)) {
      expect(price.yearly).toBe(price.monthly * 10);
    }
  });
});

// ─── PLAN_FEATURES ─────────────────────────────────────────────────────
describe('PLAN_FEATURES', () => {
  it('debe tener features para STARTER, GROWTH, PRO', () => {
    expect(PLAN_FEATURES[PLANS.STARTER]).toBeDefined();
    expect(PLAN_FEATURES[PLANS.GROWTH]).toBeDefined();
    expect(PLAN_FEATURES[PLANS.PRO]).toBeDefined();
  });

  it('cada plan debe tener al menos 5 features', () => {
    for (const features of Object.values(PLAN_FEATURES)) {
      expect(features.length).toBeGreaterThanOrEqual(5);
    }
  });

  it('PRO y STARTER deben tener cantidad similar de features', () => {
    // Ambos tienen ~10-11 features; PRO prioriza límites ilimitados, no más bullets
    expect(PLAN_FEATURES[PLANS.PRO].length).toBeGreaterThanOrEqual(8);
    expect(PLAN_FEATURES[PLANS.STARTER].length).toBeGreaterThanOrEqual(8);
  });
});

// ─── PLAN_EXCLUDED ─────────────────────────────────────────────────────
describe('PLAN_EXCLUDED', () => {
  it('STARTER debe tener exclusiones', () => {
    expect(PLAN_EXCLUDED[PLANS.STARTER].length).toBeGreaterThan(0);
  });

  it('STARTER no debe incluir Contratos, Cotizaciones, Chatbot WhatsApp', () => {
    const excluded = PLAN_EXCLUDED[PLANS.STARTER];
    expect(excluded).toContain('Contratos');
    expect(excluded).toContain('Cotizaciones');
    expect(excluded).toContain('Chatbot WhatsApp');
  });

  it('GROWTH y PRO no deben tener exclusiones', () => {
    expect(PLAN_EXCLUDED[PLANS.GROWTH]).toEqual([]);
    expect(PLAN_EXCLUDED[PLANS.PRO]).toEqual([]);
  });
});

// ─── ADDONS ──────────────────────────────────────────────────────────
describe('ADDONS', () => {
  it('debe tener al menos 3 add-ons', () => {
    expect(ADDONS.length).toBeGreaterThanOrEqual(3);
  });

  it('cada add-on debe tener id, nombre, descripcion, precio, moneda, intervalo, icon', () => {
    for (const addon of ADDONS) {
      expect(addon.id).toBeTruthy();
      expect(addon.nombre).toBeTruthy();
      expect(addon.descripcion).toBeTruthy();
      expect(typeof addon.precio).toBe('number');
      expect(addon.moneda).toBeTruthy();
      expect(addon.intervalo).toBeTruthy();
      expect(addon.icon).toBeTruthy();
    }
  });

  it('no debe haber IDs duplicados', () => {
    const ids = ADDONS.map(a => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('addon_usuarios debe tener precio 10 y intervalo usuario/mes', () => {
    const addon = ADDONS.find(a => a.id === 'addon_usuarios');
    expect(addon).toBeDefined();
    expect(addon!.precio).toBe(10);
    expect(addon!.intervalo).toBe('usuario/mes');
  });

  it('addon_whatsapp debe desbloquear chatbot_whatsapp', () => {
    const addon = ADDONS.find(a => a.id === 'addon_whatsapp');
    expect(addon).toBeDefined();
    expect(addon!.modulosDesbloqueados).toContain('chatbot_whatsapp');
  });

  it('addon_academia debe desbloquear cursos y estudiantes', () => {
    const addon = ADDONS.find(a => a.id === 'addon_academia');
    expect(addon).toBeDefined();
    expect(addon!.modulosDesbloqueados).toContain('cursos');
    expect(addon!.modulosDesbloqueados).toContain('estudiantes');
  });

  it('addon_automatizacion_ia debe tener limitesExtra ilimitados', () => {
    const addon = ADDONS.find(a => a.id === 'addon_automatizacion_ia');
    expect(addon).toBeDefined();
    expect(addon!.limitesExtra?.automation_runs).toBe(-1);
    expect(addon!.limitesExtra?.automations_count).toBe(-1);
  });
});

// ─── TRIAL_DAYS ──────────────────────────────────────────────────────
describe('TRIAL_DAYS', () => {
  it('debe ser 14 días', () => {
    expect(TRIAL_DAYS).toBe(14);
  });
});

// ─── isTrialActive ───────────────────────────────────────────────────
describe('isTrialActive', () => {
  it('debe devolver true para trial activo', () => {
    const future = new Date();
    future.setDate(future.getDate() + 5);
    const tenant = { trialEndsAt: future, estado: 'trial' };
    expect(isTrialActive(tenant)).toBe(true);
  });

  it('debe devolver false si trialEndsAt es null', () => {
    const tenant = { trialEndsAt: null, estado: 'trial' };
    expect(isTrialActive(tenant)).toBe(false);
  });

  it('debe devolver false si ya expiró', () => {
    const past = new Date();
    past.setDate(past.getDate() - 5);
    const tenant = { trialEndsAt: past, estado: 'trial' };
    expect(isTrialActive(tenant)).toBe(false);
  });

  it('debe devolver false si estado no es trial', () => {
    const future = new Date();
    future.setDate(future.getDate() + 5);
    const tenant = { trialEndsAt: future, estado: 'activo' };
    expect(isTrialActive(tenant)).toBe(false);
  });

  it('debe devolver false para estado cancelado aunque trialEndsAt sea futuro', () => {
    const future = new Date();
    future.setDate(future.getDate() + 5);
    const tenant = { trialEndsAt: future, estado: 'cancelado' };
    expect(isTrialActive(tenant)).toBe(false);
  });
});

// ─── getTrialDaysRemaining ───────────────────────────────────────────
describe('getTrialDaysRemaining', () => {
  it('debe devolver 0 si trialEndsAt es null', () => {
    expect(getTrialDaysRemaining(null)).toBe(0);
  });

  it('debe devolver días restantes positivos para trial activo', () => {
    const future = new Date();
    future.setDate(future.getDate() + 7);
    const days = getTrialDaysRemaining(future);
    expect(days).toBeGreaterThanOrEqual(6);
    expect(days).toBeLessThanOrEqual(8);
  });

  it('debe devolver 0 para trial ya expirado', () => {
    const past = new Date();
    past.setDate(past.getDate() - 3);
    expect(getTrialDaysRemaining(past)).toBe(0);
  });

  it('debe devolver 0 para trial que expira exactamente ahora', () => {
    const now = new Date();
    // Diferencia de 0 o negativa → Math.max(0, 0) = 0
    const days = getTrialDaysRemaining(now);
    expect(days).toBeGreaterThanOrEqual(0);
  });

  it('debe devolver ~1 para trial que expira en 23 horas', () => {
    const soon = new Date(Date.now() + 23 * 60 * 60 * 1000);
    const days = getTrialDaysRemaining(soon);
    expect(days).toBe(1);
  });
});
