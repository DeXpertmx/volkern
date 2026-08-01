/**
 * Test de consistencia: getPlanConfig('scale') debe devolver los mismos valores
 * tanto si se obtiene desde DB SubscriptionPlan record como desde el fallback
 * hardcodeado de lib/plans.ts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PLANS, PLAN_LIMITS, PLAN_MODULES, PLAN_PRICES } from '@/lib/plans'
import { globalPrisma } from '@/lib/db'
import { getPlanConfig } from '@/lib/subscription'

// Mock globalPrisma.subscriptionPlan.findUnique para controlar DB vs fallback
vi.mock('@/lib/db', () => ({
  globalPrisma: {
    subscriptionPlan: {
      findUnique: vi.fn(),
    },
    tenant: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    tenantFeature: {
      findMany: vi.fn(),
    },
    user: {
      count: vi.fn(),
      findMany: vi.fn(),
    },
  },
  getTenantDb: vi.fn(),
}))

/**
 * SubscriptionPlan record que replica exactamente lo que se sembró en BD
 * para el plan 'scale' (ver scripts/seed-subscription-plans.ts)
 */
function createMockScaleDbPlan() {
  return {
    id: 'mock-scale-plan-id',
    slug: 'scale',
    nombre: 'Scale',
    descripcion: 'Plan base ilimitado. CRM completo, marketing, automatizaciones, LMS, ERP y más.',
    precio: 0,
    moneda: 'EUR',
    intervalo: 'mensual',
    precioSetup: null,
    limiteUsuarios: 99,
    limiteLeads: -1,
    limiteStorage: 100,
    limiteCursos: -1,
    limiteEstudiantes: -1,
    whatsappHabilitado: true,
    emailHabilitado: true,
    smsHabilitado: true,
    telegramHabilitado: true,
    facebookHabilitado: true,
    instagramHabilitado: true,
    lmsHabilitado: true,
    automationsHabilitado: true,
    campaignsHabilitado: true,
    whitelabelHabilitado: true,
    dominioPersonalizadoHabilitado: true,
    apiAccessHabilitado: true,
    features: {
      // ALL_FEATURES_SET sin compliance_pro (51 módulos)
      modules: PLAN_MODULES[PLANS.SCALE].filter(m => m !== 'compliance_pro'),
      emails_per_month: -1,
      automation_runs: -1,
      whatsapp_messages: -1,
      sms_messages: -1,
      ai_image_generations: -1,
      business_emails: -1,
      business_domains: -1,
      business_email_gb: 10,
      automations_count: -1,
      pages: -1,
      raw_limits: {
        catalogo_items: -1,
        published_pages: -1,
        invoices: -1,
        contratos_sign: -1,
        compliance_mode: false,
      },
      stripePriceId: '',
      stripePriceYearlyId: '',
    },
    activo: true,
    esPublico: false,
    esPopular: true,
    ordenamiento: 60,
  }
}

describe('getPlanConfig("scale") — DB vs hardcoded fallback', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ── 1. Hardcoded fallback path ──
  it('debe devolver config correcta desde el fallback hardcodeado (DB retorna null)', async () => {
    // Simular que no hay registro en BD → cae al hardcoded fallback
    vi.mocked(globalPrisma.subscriptionPlan.findUnique).mockResolvedValue(null)

    const config = await getPlanConfig('scale')

    // Valores esperados del fallback hardcodeado (PLAN_LIMITS, PLAN_MODULES, PLAN_PRICES)
    expect(config).toBeDefined()
    expect(config.slug).toBe('scale')
    expect(config.nombre).toBe('Scale')
    expect(config.precio).toBe(PLAN_PRICES[PLANS.SCALE].monthly)
    expect(config.moneda).toBe(PLAN_PRICES[PLANS.SCALE].currency)
    expect(config.intervalo).toBe('mensual')
    expect(config.stripePriceId).toBe('')
    expect(config.stripePriceYearlyId).toBe('')
  })

  it('hardcodeado: limites deben coincidir con PLAN_LIMITS[PLANS.SCALE]', async () => {
    vi.mocked(globalPrisma.subscriptionPlan.findUnique).mockResolvedValue(null)

    const config = await getPlanConfig('scale')
    const expectedLimits = PLAN_LIMITS[PLANS.SCALE]

    expect(config.limites.leads).toBe(expectedLimits.leads)
    expect(config.limites.users).toBe(expectedLimits.users)
    expect(config.limites.storage_gb).toBe(expectedLimits.storage_gb)
    expect(config.limites.emails_per_month).toBe(expectedLimits.emails_per_month)
    expect(config.limites.automation_runs).toBe(expectedLimits.automation_runs)
    expect(config.limites.whatsapp_messages).toBe(expectedLimits.whatsapp_messages)
    expect(config.limites.sms_messages).toBe(expectedLimits.sms_messages)
    expect(config.limites.courses).toBe(expectedLimits.courses)
    expect(config.limites.students).toBe(expectedLimits.students)
    expect(config.limites.pages).toBe(expectedLimits.pages)
    expect(config.limites.compliance_mode).toBe(false)
  })

  it('hardcodeado: modules deben coincidir con PLAN_MODULES[PLANS.SCALE]', async () => {
    vi.mocked(globalPrisma.subscriptionPlan.findUnique).mockResolvedValue(null)

    const config = await getPlanConfig('scale')
    const expectedModules = PLAN_MODULES[PLANS.SCALE]

    expect(config.modules).toEqual(expectedModules)
    expect(config.modules.length).toBe(expectedModules.length)

    // Scale NO incluye compliance_pro (solo disponible en Compliance Pro)
    expect(config.modules).not.toContain('compliance_pro')

    // Scale DEBE tener módulos base
    expect(config.modules).toContain('leads')
    expect(config.modules).toContain('pipeline')
    expect(config.modules).toContain('mensajes')
    expect(config.modules).toContain('automatizaciones')
    expect(config.modules).toContain('rrhh')
    expect(config.modules).toContain('finanzas')
    expect(config.modules).toContain('estrategia')
  })

  // ── 2. DB-backed path ──
  it('debe devolver config correcta desde DB SubscriptionPlan record', async () => {
    const mockDbPlan = createMockScaleDbPlan()
    vi.mocked(globalPrisma.subscriptionPlan.findUnique).mockResolvedValue(mockDbPlan as any)

    const config = await getPlanConfig('scale')

    expect(config).toBeDefined()
    expect(config.slug).toBe('scale')
    expect(config.nombre).toBe('Scale')
    expect(config.precio).toBe(0)
    expect(config.moneda).toBe('EUR')
    expect(config.stripePriceId).toBe('')
    expect(config.stripePriceYearlyId).toBe('')
  })

  it('DB: limites deben coincidir con PLAN_LIMITS[PLANS.SCALE]', async () => {
    const mockDbPlan = createMockScaleDbPlan()
    vi.mocked(globalPrisma.subscriptionPlan.findUnique).mockResolvedValue(mockDbPlan as any)

    const config = await getPlanConfig('scale')
    const expectedLimits = PLAN_LIMITS[PLANS.SCALE]

    // Comparar cada límite clave
    for (const [key, value] of Object.entries(expectedLimits)) {
      expect(config.limites[key]).toBe(value)
    }
  })

  it('DB: modules deben incluir todos los módulos base (Scale no tiene compliance_pro)', async () => {
    const mockDbPlan = createMockScaleDbPlan()
    vi.mocked(globalPrisma.subscriptionPlan.findUnique).mockResolvedValue(mockDbPlan as any)

    const config = await getPlanConfig('scale')

    // Scale NO incluye compliance_pro (solo disponible en Compliance Pro)
    expect(config.modules).not.toContain('compliance_pro')

    // Scale DEBE tener módulos esenciales
    expect(config.modules).toContain('leads')
    expect(config.modules).toContain('pipeline')
    expect(config.modules).toContain('mensajes')
    expect(config.modules).toContain('cms')
    expect(config.modules).toContain('cursos')
    expect(config.modules).toContain('automatizaciones')
    expect(config.modules).toContain('finanzas')
    expect(config.modules).toContain('produccion')
    expect(config.modules).toContain('inventario')
    expect(config.modules).toContain('estrategia')
  })

  it('DB: branding debe tener whitelabel y customDomain en true', async () => {
    const mockDbPlan = createMockScaleDbPlan()
    vi.mocked(globalPrisma.subscriptionPlan.findUnique).mockResolvedValue(mockDbPlan as any)

    const config = await getPlanConfig('scale')

    expect(config.branding).toBeDefined()
    expect(config.branding?.whitelabel).toBe(true)
    expect(config.branding?.customDomain).toBe(true)
  })

  // ── 3. Consistencia DB vs hardcoded ──
  it('DB y hardcoded deben producir config idéntica para Scale', async () => {
    const mockDbPlan = createMockScaleDbPlan()

    // Obtener hardcoded (null → fallback)
    vi.mocked(globalPrisma.subscriptionPlan.findUnique).mockResolvedValueOnce(null)
    const hardcodedConfig = await getPlanConfig('scale')

    // Obtener DB-backed
    vi.mocked(globalPrisma.subscriptionPlan.findUnique).mockResolvedValueOnce(mockDbPlan as any)
    const dbConfig = await getPlanConfig('scale')

    // Comparar campos clave
    expect(dbConfig.slug).toBe(hardcodedConfig.slug)
    expect(dbConfig.nombre).toBe(hardcodedConfig.nombre)
    expect(dbConfig.precio).toBe(hardcodedConfig.precio)
    // moneda: DB guarda 'EUR', hardcoded usa 'eur' (solo diferencia de casing)
    expect(dbConfig.moneda.toUpperCase()).toBe(hardcodedConfig.moneda.toUpperCase())

    // Ambos deben tener los mismos límites clave
    for (const key of ['leads', 'users', 'storage_gb', 'emails_per_month', 'automation_runs', 'whatsapp_messages', 'sms_messages', 'courses', 'students', 'pages', 'compliance_mode'] as const) {
      expect(dbConfig.limites[key]).toBe(hardcodedConfig.limites[key])
    }

    // Ambos deben tener los mismos módulos (como conjuntos, orden puede variar)
    expect(new Set(dbConfig.modules)).toEqual(new Set(hardcodedConfig.modules))

    // Ambos deben tener stripePriceId vacío
    expect(dbConfig.stripePriceId).toBe('')
    expect(hardcodedConfig.stripePriceId).toBe('')
  })

  // ── 4. Compliance también debe ser consistente ──
  it('DB y hardcoded deben producir config idéntica para Compliance', async () => {
    const mockCompliancePlan = {
      id: 'mock-compliance-plan-id',
      slug: 'compliance',
      nombre: 'Compliance Pro',
      descripcion: 'Plan con Compliance PRO.',
      precio: 0,
      moneda: 'EUR',
      intervalo: 'mensual',
      precioSetup: null,
      limiteUsuarios: 99,
      limiteLeads: -1,
      limiteStorage: 250,
      limiteCursos: -1,
      limiteEstudiantes: -1,
      whatsappHabilitado: true,
      emailHabilitado: true,
      smsHabilitado: true,
      telegramHabilitado: true,
      facebookHabilitado: true,
      instagramHabilitado: true,
      lmsHabilitado: true,
      automationsHabilitado: true,
      campaignsHabilitado: true,
      whitelabelHabilitado: true,
      dominioPersonalizadoHabilitado: true,
      apiAccessHabilitado: true,
      features: {
        modules: [...PLAN_MODULES[PLANS.COMPLIANCE]],
        emails_per_month: -1,
        automation_runs: -1,
        whatsapp_messages: -1,
        sms_messages: -1,
        ai_image_generations: -1,
        business_emails: -1,
        business_domains: -1,
        business_email_gb: 25,
        automations_count: -1,
        pages: -1,
        raw_limits: {
          catalogo_items: -1,
          published_pages: -1,
          invoices: -1,
          contratos_sign: -1,
          compliance_mode: true,
        },
        stripePriceId: '',
        stripePriceYearlyId: '',
      },
      activo: true,
      esPublico: false,
      esPopular: false,
      ordenamiento: 70,
    }

    // Hardcoded
    vi.mocked(globalPrisma.subscriptionPlan.findUnique).mockResolvedValueOnce(null)
    const hardcodedConfig = await getPlanConfig('compliance')

    // DB-backed
    vi.mocked(globalPrisma.subscriptionPlan.findUnique).mockResolvedValueOnce(mockCompliancePlan as any)
    const dbConfig = await getPlanConfig('compliance')

    expect(dbConfig.nombre).toBe('Compliance Pro')
    expect(dbConfig.limites.compliance_mode).toBe(true)
    expect(dbConfig.limites.storage_gb).toBe(250)
    expect(dbConfig.modules).toContain('compliance_pro')

    // Consistencia
    expect(dbConfig.slug).toBe(hardcodedConfig.slug)
    expect(dbConfig.limites.compliance_mode).toBe(hardcodedConfig.limites.compliance_mode)
    expect(dbConfig.limites.storage_gb).toBe(hardcodedConfig.limites.storage_gb)
    expect(new Set(dbConfig.modules)).toEqual(new Set(hardcodedConfig.modules))
  })

  // ── 5. Planes legacy también deben ser consistentes ──
  it('planes legacy esencial/profesional/infinity también son consistentes DB vs hardcoded', async () => {
    const legacyPlans = [
      {
        slug: 'esencial',
        dbPlan: {
          id: 'mock-esencial-plan-id',
          slug: 'esencial',
          nombre: 'Esencial',
          precio: 69,
          moneda: 'EUR',
          intervalo: 'mensual',
          limiteUsuarios: 2,
          limiteLeads: 1000,
          limiteStorage: 5,
          limiteCursos: 5,
          limiteEstudiantes: 50,
          whatsappHabilitado: true,
          emailHabilitado: true,
          smsHabilitado: true,
          telegramHabilitado: true,
          facebookHabilitado: true,
          instagramHabilitado: true,
          lmsHabilitado: true,
          automationsHabilitado: true,
          campaignsHabilitado: true,
          whitelabelHabilitado: false,
          dominioPersonalizadoHabilitado: false,
          apiAccessHabilitado: true,
          features: {
            modules: PLAN_MODULES[PLANS.ESENCIAL].filter((m: string) => m !== 'compliance_pro'),
            emails_per_month: 2500,
            automation_runs: 500,
            whatsapp_messages: 500,
            sms_messages: 250,
            ai_image_generations: 10,
            business_emails: 0,
            business_domains: 0,
            business_email_gb: 0,
            automations_count: 5,
            pages: 5,
            raw_limits: {
              catalogo_items: 100,
              published_pages: 3,
              invoices: 50,
              contratos_sign: 20,
              compliance_mode: false,
            },
            stripePriceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_ESENCIAL_MONTHLY || '',
            stripePriceYearlyId: process.env.NEXT_PUBLIC_STRIPE_PRICE_ESENCIAL_YEARLY || '',
          },
          activo: true, esPublico: false, esPopular: false, ordenamiento: 10,
          precioSetup: null, descripcion: null,
        },
      },
      {
        slug: 'profesional',
        dbPlan: {
          id: 'mock-profesional-plan-id',
          slug: 'profesional',
          nombre: 'Profesional',
          precio: 149,
          moneda: 'EUR',
          intervalo: 'mensual',
          limiteUsuarios: 5,
          limiteLeads: 5000,
          limiteStorage: 25,
          limiteCursos: 20,
          limiteEstudiantes: 500,
          whatsappHabilitado: true,
          emailHabilitado: true,
          smsHabilitado: true,
          telegramHabilitado: true,
          facebookHabilitado: true,
          instagramHabilitado: true,
          lmsHabilitado: true,
          automationsHabilitado: true,
          campaignsHabilitado: true,
          whitelabelHabilitado: false,
          dominioPersonalizadoHabilitado: false,
          apiAccessHabilitado: true,
          features: {
            modules: [...PLAN_MODULES[PLANS.PROFESIONAL]],
            emails_per_month: 10000,
            automation_runs: 5000,
            whatsapp_messages: 2000,
            sms_messages: 1000,
            ai_image_generations: 50,
            business_emails: 10,
            business_domains: 1,
            business_email_gb: 1,
            automations_count: 20,
            pages: 20,
            raw_limits: {
              catalogo_items: 500,
              published_pages: 10,
              invoices: 500,
              contratos_sign: 200,
              compliance_mode: false,
            },
            stripePriceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_PROFESIONAL_MONTHLY || '',
            stripePriceYearlyId: process.env.NEXT_PUBLIC_STRIPE_PRICE_PROFESIONAL_YEARLY || '',
          },
          activo: true, esPublico: false, esPopular: false, ordenamiento: 20,
          precioSetup: null, descripcion: null,
        },
      },
      {
        slug: 'infinity',
        dbPlan: {
          id: 'mock-infinity-plan-id',
          slug: 'infinity',
          nombre: 'Infinity',
          precio: 299,
          moneda: 'EUR',
          intervalo: 'mensual',
          limiteUsuarios: 15,
          limiteLeads: -1,
          limiteStorage: 100,
          limiteCursos: -1,
          limiteEstudiantes: -1,
          whatsappHabilitado: true,
          emailHabilitado: true,
          smsHabilitado: true,
          telegramHabilitado: true,
          facebookHabilitado: true,
          instagramHabilitado: true,
          lmsHabilitado: true,
          automationsHabilitado: true,
          campaignsHabilitado: true,
          whitelabelHabilitado: true,
          dominioPersonalizadoHabilitado: true,
          apiAccessHabilitado: true,
          features: {
            modules: [...PLAN_MODULES[PLANS.INFINITY]],
            emails_per_month: -1,
            automation_runs: -1,
            whatsapp_messages: 10000,
            sms_messages: 5000,
            ai_image_generations: -1,
            business_emails: -1,
            business_domains: -1,
            business_email_gb: 10,
            automations_count: -1,
            pages: -1,
            raw_limits: {
              catalogo_items: -1,
              published_pages: -1,
              invoices: -1,
              contratos_sign: -1,
              compliance_mode: true,
            },
            stripePriceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_INFINITY_MONTHLY || '',
            stripePriceYearlyId: process.env.NEXT_PUBLIC_STRIPE_PRICE_INFINITY_YEARLY || '',
          },
          activo: true, esPublico: false, esPopular: false, ordenamiento: 30,
          precioSetup: null, descripcion: null,
        },
      },
    ]

    for (const { slug, dbPlan } of legacyPlans) {
      // Hardcoded path
      vi.mocked(globalPrisma.subscriptionPlan.findUnique).mockResolvedValueOnce(null)
      const hardcoded = await getPlanConfig(slug)

      // DB path
      vi.mocked(globalPrisma.subscriptionPlan.findUnique).mockResolvedValueOnce(dbPlan as any)
      const fromDb = await getPlanConfig(slug)

    // Consistencia
    expect(fromDb.slug).toBe(hardcoded.slug)
    expect(fromDb.nombre).toBe(hardcoded.nombre)
    expect(fromDb.precio).toBe(hardcoded.precio)
    // moneda: DB guarda 'EUR', hardcoded usa 'eur' (solo diferencia de casing)
    expect(fromDb.moneda.toUpperCase()).toBe(hardcoded.moneda.toUpperCase())
    expect(new Set(fromDb.modules)).toEqual(new Set(hardcoded.modules))

      // Límites clave
      const expectedLimits = PLAN_LIMITS[slug as keyof typeof PLAN_LIMITS]
      for (const key of ['leads', 'users', 'storage_gb', 'emails_per_month', 'automation_runs'] as const) {
        expect(fromDb.limites[key]).toBe(expectedLimits[key])
      }
    }
  })

  // ── 6. Planes contables: fallback hardcodeado (no tienen registro en BD) ──
  it('accounting-slot: el fallback debe devolver PLAN_MODULES[ACCOUNTING_SLOT] (con insurance)', async () => {
    // Sin registro en BD → cae al hardcoded fallback
    vi.mocked(globalPrisma.subscriptionPlan.findUnique).mockResolvedValue(null)

    const config = await getPlanConfig('accounting-slot')

    expect(config.slug).toBe('accounting-slot')
    expect(new Set(config.modules)).toEqual(new Set(PLAN_MODULES[PLANS.ACCOUNTING_SLOT]))
    // Guard de regresión: la vertical contable debe incluir insurance
    expect(config.modules).toContain('insurance')
    expect(config.modules).toContain('finanzas')
    expect(config.modules).toContain('conciliacion')
  })

  it('pro-accounting: el fallback debe devolver PLAN_MODULES[PRO_ACCOUNTING] (superset del slot)', async () => {
    vi.mocked(globalPrisma.subscriptionPlan.findUnique).mockResolvedValue(null)

    const config = await getPlanConfig('pro-accounting')

    expect(config.slug).toBe('pro-accounting')
    expect(new Set(config.modules)).toEqual(new Set(PLAN_MODULES[PLANS.PRO_ACCOUNTING]))
    expect(config.modules).toContain('insurance')
    // El plan padre debe incluir módulos de la firma que el slot no tiene
    expect(config.modules).toContain('agency')
    expect(config.modules).toContain('white_label')

    // Superset: todo lo del slot contable debe estar en pro-accounting
    for (const mod of PLAN_MODULES[PLANS.ACCOUNTING_SLOT]) {
      expect(config.modules).toContain(mod)
    }
  })
})
