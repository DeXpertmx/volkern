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

  it('Esencial no incluye compliance_pro; Profesional e Infinity sí', () => {
    const esencial = PLAN_MODULES[PLANS.ESENCIAL];
    const profesional = PLAN_MODULES[PLANS.PROFESIONAL];
    const infinity = PLAN_MODULES[PLANS.INFINITY];
    expect(esencial).not.toContain('compliance_pro');
    expect(profesional).toContain('compliance_pro');
    expect(infinity).toContain('compliance_pro');
    expect(esencial.length).toBeGreaterThan(50);
  });

  it('Profesional e Infinity deben tener el mismo set de módulos', () => {
    expect(new Set(PLAN_MODULES[PLANS.PROFESIONAL])).toEqual(new Set(PLAN_MODULES[PLANS.INFINITY]));
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

  it('todos los planes deben incluir el módulo insurance (incluida la vertical contable)', () => {
    for (const [plan, modules] of Object.entries(PLAN_MODULES)) {
      expect(modules, `plan ${plan} debe incluir insurance`).toContain('insurance');
    }
  });

  it('todos los planes deben incluir los módulos core (CRM, comunicación, administración)', () => {
    // La omisión de insurance en la vertical contable ocurrió porque nada fijaba
    // los módulos que TODO plan debe tener. Este set core aplica a todos los planes.
    const CORE_MODULES = [
      'leads', 'contactos', 'empresas', 'pipeline', 'tareas',
      'mensajes', 'citas', 'catalogo',
      'equipo', 'configuracion',
    ];
    for (const [plan, modules] of Object.entries(PLAN_MODULES)) {
      for (const core of CORE_MODULES) {
        expect(modules, `plan ${plan} debe incluir módulo core ${core}`).toContain(core);
      }
    }
  });

  it('los planes de cada vertical deben incluir los módulos clave de esa vertical', () => {
    // Mapa vertical → módulos que la identifican y planes que deben cubrirla.
    // Si un plan de una vertical omite un módulo clave (como pasó con insurance
    // en la vertical contable), este test lo detecta con el nombre del plan y módulo.
    const VERTICAL_KEY_MODULES: Record<string, { modules: string[]; plans: string[] }> = {
      contable: {
        modules: ['finanzas', 'conciliacion', 'cotizaciones', 'contratos', 'ordenes_venta'],
        plans: [PLANS.ACCOUNTING_SLOT, PLANS.PRO_ACCOUNTING],
      },
      agencia: {
        modules: ['agency', 'white_label', 'custom_domain'],
        plans: [PLANS.PRO_AGENCY, PLANS.PRO_ACCOUNTING],
      },
      academia: {
        modules: ['cursos', 'estudiantes'],
        plans: [PLANS.TRIAL, PLANS.ESENCIAL, PLANS.PROFESIONAL, PLANS.INFINITY, PLANS.SCALE, PLANS.COMPLIANCE, PLANS.PRO_AGENCY],
      },
      marketing: {
        modules: ['campanas', 'email_marketing', 'cms', 'ads'],
        plans: [PLANS.TRIAL, PLANS.ESENCIAL, PLANS.PROFESIONAL, PLANS.INFINITY, PLANS.SCALE, PLANS.COMPLIANCE, PLANS.PRO_AGENCY, PLANS.AGENCY_SLOT],
      },
      erp: {
        modules: ['rrhh', 'finanzas', 'inventario', 'produccion', 'proyectos'],
        plans: [PLANS.TRIAL, PLANS.ESENCIAL, PLANS.PROFESIONAL, PLANS.INFINITY, PLANS.SCALE, PLANS.COMPLIANCE, PLANS.PRO_AGENCY],
      },
      seguros: {
        modules: ['insurance'],
        plans: Object.values(PLANS), // todos los planes incluyen seguros
      },
    };

    for (const [vertical, { modules, plans }] of Object.entries(VERTICAL_KEY_MODULES)) {
      for (const plan of plans) {
        const planModules = PLAN_MODULES[plan];
        expect(planModules, `vertical ${vertical}: plan ${plan} debe existir en PLAN_MODULES`).toBeDefined();
        for (const mod of modules) {
          expect(planModules, `vertical ${vertical}: plan ${plan} debe incluir módulo clave ${mod}`).toContain(mod);
        }
      }
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

  it('PREMIUM (legacy) debe estar definido y permitir automatizaciones ilimitadas', () => {
    // Regression: 'premium' existía como plan en BD (ej. DeXpert) pero no estaba
    // en PLAN_LIMITS, así que todo caía al fallback 'esencial' silenciosamente.
    const premium = PLAN_LIMITS[PLANS.PREMIUM];
    expect(premium).toBeDefined();
    expect(premium.automation_runs).toBe(-1);
    expect(premium.automations_count).toBe(-1);
    expect(premium.leads).toBe(-1);
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

  it('yearly debe ser menor que monthly * 12 (descuento anual ~20%) — salta planes dinámicos (precio 0)', () => {
    for (const [planKey, price] of Object.entries(PLAN_PRICES)) {
      // Planes dinámicos (Scale/Compliance) tienen precio 0 porque usan pricing engine
      if (price.monthly === 0) continue;
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
