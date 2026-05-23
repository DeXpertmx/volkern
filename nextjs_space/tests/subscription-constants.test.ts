import { describe, it, expect } from 'vitest';
import { FEATURE_LABELS, type FeatureName } from '@/lib/subscription';

// ==================== FEATURE_LABELS ====================
describe('FEATURE_LABELS', () => {
  it('debe tener 16 features', () => {
    const keys = Object.keys(FEATURE_LABELS);
    expect(keys).toHaveLength(16);
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
    expect(FEATURE_LABELS.contacts).toBe('Contactos');
    expect(FEATURE_LABELS.emails_per_month).toBe('Emails al mes');
  });

  it('debe incluir features de almacenamiento', () => {
    expect(FEATURE_LABELS.storage_gb).toBe('Almacenamiento (GB)');
    expect(FEATURE_LABELS.business_email_gb).toBe('Almacenamiento email (GB)');
  });

  it('debe incluir features de messaging', () => {
    expect(FEATURE_LABELS.whatsapp_messages).toBe('Mensajes WhatsApp');
    expect(FEATURE_LABELS.sms_messages).toBe('Mensajes SMS');
  });

  it('debe incluir features de negocio', () => {
    expect(FEATURE_LABELS.business_emails).toBe('Emails de negocio');
    expect(FEATURE_LABELS.business_domains).toBe('Dominios de negocio');
    expect(FEATURE_LABELS.pages).toBe('Páginas');
  });

  it('debe incluir features de IA', () => {
    expect(FEATURE_LABELS.ai_image_generations).toBe('Generaciones de imagen IA');
    expect(FEATURE_LABELS.automation_runs).toBe('Ejecuciones de automatización');
    expect(FEATURE_LABELS.automations_count).toBe('Automatizaciones');
  });

  it('debe incluir features de academia', () => {
    expect(FEATURE_LABELS.courses).toBe('Cursos');
    expect(FEATURE_LABELS.students).toBe('Estudiantes');
  });

  it('todas las keys deben ser del tipo FeatureName', () => {
    const validFeatures: FeatureName[] = [
      'leads', 'users', 'contacts', 'emails_per_month', 'automation_runs',
      'whatsapp_messages', 'sms_messages', 'courses', 'students', 'storage_gb',
      'ai_image_generations', 'business_emails', 'business_domains',
      'business_email_gb', 'automations_count', 'pages',
    ];
    const keys = Object.keys(FEATURE_LABELS);
    for (const key of keys) {
      expect(validFeatures).toContain(key);
    }
    expect(keys.sort()).toEqual([...validFeatures].sort());
  });
});

// ==================== getHardcodedPlanConfig (via plans) ====================
// La función getHardcodedPlanConfig es privada en subscription.ts,
// pero podemos testearla indirectamente via getPlanConfig con slugs válidos.
// Estos tests validan que el mapeo de planes hardcodeados es correcto.

import { PLANS, PLAN_LIMITS, PLAN_MODULES, PLAN_PRICES } from '@/lib/plans';

describe('PLAN_LIMITS consistency with hardcoded plans', () => {
  it('PLAN_LIMITS debe tener entrada para TRIAL', () => {
    expect(PLAN_LIMITS[PLANS.TRIAL]).toBeDefined();
  });

  it('PLAN_LIMITS debe tener entrada para STARTER', () => {
    expect(PLAN_LIMITS[PLANS.STARTER]).toBeDefined();
  });

  it('PLAN_LIMITS debe tener entrada para GROWTH', () => {
    expect(PLAN_LIMITS[PLANS.GROWTH]).toBeDefined();
  });

  it('PLAN_LIMITS debe tener entrada para PRO', () => {
    expect(PLAN_LIMITS[PLANS.PRO]).toBeDefined();
  });

  it('PLAN_LIMITS debe tener entrada para PRO_AGENCY', () => {
    expect(PLAN_LIMITS[PLANS.PRO_AGENCY]).toBeDefined();
  });

  it('TRIAL no debe permitir automation_runs', () => {
    expect(PLAN_LIMITS[PLANS.TRIAL].automation_runs).toBe(0);
  });

  it('TRIAL debe permitir 2 usuarios', () => {
    expect(PLAN_LIMITS[PLANS.TRIAL].users).toBe(2);
  });

  it('STARTER no debe permitir automation_runs', () => {
    expect(PLAN_LIMITS[PLANS.STARTER].automation_runs).toBe(0);
  });

  it('GROWTH debe tener automation_runs con valor positivo o ilimitado', () => {
    expect(PLAN_LIMITS[PLANS.GROWTH].automation_runs).toBeGreaterThan(0);
  });

  it('PRO debe tener automation_runs ilimitado (-1)', () => {
    expect(PLAN_LIMITS[PLANS.PRO].automation_runs).toBe(-1);
  });

  it('PLAN_MODULES debe tener entrada para cada plan en PLANS', () => {
    for (const planKey of Object.values(PLANS)) {
      expect(PLAN_MODULES[planKey]).toBeDefined();
    }
  });

  it('TRIAL debe tener al menos 10 módulos', () => {
    expect(PLAN_MODULES[PLANS.TRIAL].length).toBeGreaterThanOrEqual(10);
  });

  it('PRO debe tener al menos 20 módulos', () => {
    expect(PLAN_MODULES[PLANS.PRO].length).toBeGreaterThanOrEqual(20);
  });

  it('PRO debe incluir todos los módulos de GROWTH', () => {
    for (const mod of PLAN_MODULES[PLANS.GROWTH]) {
      expect(PLAN_MODULES[PLANS.PRO]).toContain(mod);
    }
  });

  it('PLAN_PRICES debe tener precios para los planes de pago', () => {
    expect(PLAN_PRICES[PLANS.STARTER]).toBeDefined();
    expect(PLAN_PRICES[PLANS.GROWTH]).toBeDefined();
    expect(PLAN_PRICES[PLANS.PRO]).toBeDefined();
  });

  it('PLAN_PRICES debe incluir monthly, yearly y currency', () => {
    for (const planKey of [PLANS.STARTER, PLANS.GROWTH, PLANS.PRO] as const) {
      const prices = PLAN_PRICES[planKey];
      expect(prices).toBeDefined();
      if (prices) {
        expect(typeof prices.monthly).toBe('number');
        expect(typeof prices.yearly).toBe('number');
        expect(typeof prices.currency).toBe('string');
        expect(prices.currency.length).toBe(3);
        // yearly debe ser menor que monthly*12 (descuento anual)
        expect(prices.yearly).toBeLessThanOrEqual(prices.monthly * 12);
      }
    }
  });
});
