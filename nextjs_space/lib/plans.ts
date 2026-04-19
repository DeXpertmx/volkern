// import { prisma } from './db' - Moved to dynamic import for client-side safety

export const PLANS = {
  STARTER: 'starter',
  GROWTH: 'growth',
  PRO: 'pro',
  TRIAL: 'trial'
} as const

export type PlanType = typeof PLANS[keyof typeof PLANS]

// ============== MÓDULOS ==============
// Cada módulo mapea a funcionalidades del CRM que se pueden activar/desactivar

export type CrmModule =
  | 'leads'
  | 'contactos'
  | 'empresas'
  | 'pipeline'
  | 'tareas'
  | 'analytics'
  | 'mensajes'
  | 'citas'
  | 'catalogo'
  | 'campanas'
  | 'email_marketing'
  | 'cms'
  | 'automatizaciones'
  | 'cursos'
  | 'estudiantes'
  | 'cotizaciones'
  | 'contratos'
  | 'ordenes_venta'
  | 'pronosticos'
  | 'scoring'
  | 'chatbot_whatsapp'
  | 'integraciones'
  | 'mi_tarjeta'
  | 'equipo'
  | 'configuracion'
  | 'white_label'
  | 'custom_domain'
  | 'whatsapp'
  | 'meta_integration'
  | 'sms'
  | 'telegram'
  | 'google_calendar'
  | 'api_access'
  | 'builder_premium'
  | 'telefonia'
  | 'social_manager'
  | 'rrhh'
  | 'finanzas'
  | 'finanzas_consolidado'
  | 'calidad'
  | 'produccion'
  | 'inventario'
  | 'proyectos'



export interface ModuleDefinition {
  id: CrmModule
  label: string
  description: string
  icon: string  // emoji
  group: string
}

export const ALL_MODULES: ModuleDefinition[] = [
  // Ventas & Leads
  { id: 'leads', label: 'Leads', description: 'Gestión de leads y prospectos', icon: '👥', group: 'Ventas & Leads' },
  { id: 'contactos', label: 'Contactos', description: 'Base de contactos convertidos', icon: '✅', group: 'Ventas & Leads' },
  { id: 'empresas', label: 'Empresas', description: 'Gestión de empresas/cuentas', icon: '🏢', group: 'Ventas & Leads' },
  { id: 'pipeline', label: 'Pipeline', description: 'Pipeline visual de ventas', icon: '📈', group: 'Ventas & Leads' },
  { id: 'tareas', label: 'Tareas', description: 'Gestión de tareas del equipo', icon: '📋', group: 'Ventas & Leads' },
  { id: 'analytics', label: 'Analytics', description: 'Panel de analíticas', icon: '📊', group: 'Ventas & Leads' },
  { id: 'cotizaciones', label: 'Cotizaciones', description: 'Crear y gestionar cotizaciones', icon: '📄', group: 'Ventas & Leads' },
  { id: 'contratos', label: 'Contratos', description: 'Gestión de contratos', icon: '📜', group: 'Ventas & Leads' },
  { id: 'ordenes_venta', label: 'Órdenes de Venta', description: 'Órdenes y facturación', icon: '🛒', group: 'Ventas & Leads' },
  { id: 'pronosticos', label: 'Pronósticos', description: 'Pronósticos de venta', icon: '🔮', group: 'Ventas & Leads' },
  { id: 'scoring', label: 'Scoring', description: 'Puntuación automática de leads', icon: '🏆', group: 'Ventas & Leads' },
  // Comunicación
  { id: 'mensajes', label: 'Mensajes', description: 'Centro de mensajería', icon: '💬', group: 'Comunicación' },
  { id: 'citas', label: 'Citas', description: 'Agendamiento de citas', icon: '📅', group: 'Comunicación' },
  { id: 'catalogo', label: 'Catálogo', description: 'Catálogo de productos/servicios', icon: '🏷️', group: 'Comunicación' },
  { id: 'chatbot_whatsapp', label: 'Chatbot WhatsApp', description: 'Chatbot automatizado por WhatsApp', icon: '🤖', group: 'Comunicación' },
  // Marketing
  { id: 'campanas', label: 'Campañas', description: 'Campañas de marketing', icon: '📣', group: 'Marketing' },
  { id: 'email_marketing', label: 'Email Marketing', description: 'Campañas de email', icon: '✉️', group: 'Marketing' },
  { id: 'cms', label: 'Constructor Web (CMS)', description: 'Constructor básico de páginas y blogs', icon: '🌐', group: 'Marketing' },
  { id: 'builder_premium', label: 'Constructor Premium', description: 'WebCreator avanzado con GrapesJS y funciones pro', icon: '🏗️', group: 'Marketing' },
  { id: 'social_manager', label: 'Hub Social', description: 'Gestión y programación de redes sociales', icon: '📱', group: 'Marketing' },
  // Academia
  { id: 'cursos', label: 'Cursos', description: 'Gestión de cursos', icon: '📚', group: 'Academia' },
  { id: 'estudiantes', label: 'Estudiantes', description: 'Gestión de estudiantes', icon: '🎓', group: 'Academia' },
  // Automatización
  { id: 'automatizaciones', label: 'Automatizaciones', description: 'Motor de automatización', icon: '⚙️', group: 'Automatización' },
  // Personal
  { id: 'mi_tarjeta', label: 'Mi Tarjeta', description: 'Tarjeta digital de presentación', icon: '💳', group: 'Personal' },
  // Administración
  { id: 'integraciones', label: 'Integraciones', description: 'Conexiones con servicios externos', icon: '🔌', group: 'Administración' },
  { id: 'equipo', label: 'Equipo', description: 'Gestión del equipo', icon: '👤', group: 'Administración' },
  { id: 'configuracion', label: 'Configuración', description: 'Ajustes generales', icon: '⚙️', group: 'Administración' },
  { id: 'white_label', label: 'Marca Blanca', description: 'Elimina el branding de Volkern y personaliza la UI', icon: '🏷️', group: 'Administración' },
  { id: 'custom_domain', label: 'Dominio Personalizado', description: 'Usa tu propio dominio para la plataforma', icon: '🌐', group: 'Administración' },
  // Integraciones Avanzadas
  { id: 'whatsapp', label: 'WhatsApp', description: 'Integración oficial con WhatsApp', icon: '📱', group: 'Integraciones' },
  { id: 'meta_integration', label: 'Meta (FB/IG)', description: 'Facebook e Instagram Messenger', icon: '♾️', group: 'Integraciones' },
  { id: 'telegram', label: 'Telegram', description: 'Integración con Telegram Bot', icon: '✈️', group: 'Integraciones' },
  { id: 'sms', label: 'SMS Gateway', description: 'Envío de notificaciones por SMS', icon: '💬', group: 'Integraciones' },
  { id: 'google_calendar', label: 'Google Calendar', description: 'Sincronización de citas y eventos', icon: '📅', group: 'Integraciones' },
  { id: 'api_access', label: 'Acceso a la API', description: 'Tokens de API para desarrolladores', icon: '🔑', group: 'Integraciones' },
  { id: 'telefonia', label: 'Telefonía Inteligente', description: 'Integración con Zadarma para llamadas VoIP', icon: '📞', group: 'Comunicación' },
  // ERP Industrial
  { id: 'rrhh', label: 'RRHH', description: 'Gestión de talento y nóminas', icon: '👥', group: 'ERP' },
  { id: 'finanzas', label: 'Finanzas', description: 'Gestión de gastos e ingresos', icon: '💰', group: 'ERP' },
  { id: 'finanzas_consolidado', label: 'Consolidado Financiero', description: 'Vista multi-tenant financiera', icon: '📊', group: 'ERP' },
  { id: 'calidad', label: 'Calidad', description: 'Control de calidad industrial', icon: '✅', group: 'ERP' },
  { id: 'produccion', label: 'Producción', description: 'Gestión de manufactura y BoM', icon: '🏭', group: 'ERP' },
  { id: 'inventario', label: 'Inventario', description: 'Gestión de almacenes y stock', icon: '📦', group: 'ERP' },
  { id: 'proyectos', label: 'Proyectos', description: 'Gestión de obras y proyectos', icon: '🏗️', group: 'ERP' },
]


// ============== MÓDULOS POR PLAN ==============
// Define qué módulos incluye cada plan

export const PLAN_MODULES: Record<string, CrmModule[]> = {
  [PLANS.TRIAL]: [
    'leads', 'contactos', 'empresas', 'pipeline', 'tareas', 'analytics',
    'mensajes', 'citas', 'catalogo',
    'campanas', 'email_marketing', 'cms', 'builder_premium',
    'mi_tarjeta',
    'equipo', 'configuracion',
    'telefonia',
    'social_manager',
    'rrhh', 'finanzas', 'calidad', 'produccion', 'inventario', 'proyectos'
  ],
  [PLANS.STARTER]: [
    'leads', 'contactos', 'empresas', 'pipeline', 'tareas', 'analytics',
    'mensajes', 'citas', 'catalogo',
    'campanas', 'email_marketing',
    'mi_tarjeta',
    'equipo', 'configuracion',
    'telefonia',
    'social_manager',
  ],
  [PLANS.GROWTH]: [
    'leads', 'contactos', 'empresas', 'pipeline', 'tareas', 'analytics',
    'cotizaciones', 'contratos', 'ordenes_venta', 'pronosticos', 'scoring',
    'mensajes', 'citas', 'catalogo', 'chatbot_whatsapp',
    'campanas', 'email_marketing', 'cms', 'builder_premium',
    'automatizaciones',
    'cursos', 'estudiantes',
    'mi_tarjeta',
    'integraciones', 'equipo', 'configuracion',
    'telefonia',
    'social_manager',
    'rrhh', 'finanzas', 'calidad', 'produccion', 'inventario', 'proyectos', 'finanzas_consolidado'
  ],
  [PLANS.PRO]: [
    'leads', 'contactos', 'empresas', 'pipeline', 'tareas', 'analytics',
    'cotizaciones', 'contratos', 'ordenes_venta', 'pronosticos', 'scoring',
    'mensajes', 'citas', 'catalogo', 'chatbot_whatsapp',
    'campanas', 'email_marketing', 'cms', 'builder_premium',
    'automatizaciones',
    'cursos', 'estudiantes',
    'mi_tarjeta',
    'integraciones', 'equipo', 'configuracion',
    'telefonia',
    'social_manager',
    'rrhh', 'finanzas', 'calidad', 'produccion', 'inventario', 'proyectos', 'finanzas_consolidado'
  ],
}

// ============== LÍMITES POR PLAN ==============

export const PLAN_LIMITS = {
  [PLANS.TRIAL]: {
    leads: 100,
    users: 2,
    emails_per_month: 500,
    automation_runs: 0,
    whatsapp_messages: 100,
    sms_messages: 50,
    courses: 0,
    students: 0,
    storage_gb: 1,
    ai_image_generations: 5,
    business_emails: 0,
    business_domains: 0,
    business_email_gb: 0,
    automations_count: 0,
    pages: 3,
  },
  [PLANS.STARTER]: {
    leads: 2500,
    users: 2,
    emails_per_month: 2500,
    automation_runs: 0,
    whatsapp_messages: 500,
    sms_messages: 250,
    courses: 0,
    students: 0,
    storage_gb: 5,
    ai_image_generations: 10,
    business_emails: 0,
    business_domains: 0,
    business_email_gb: 0,
    automations_count: 3,
    pages: 5,
  },
  [PLANS.GROWTH]: {
    leads: 10000,
    users: 5,
    emails_per_month: 20000,
    automation_runs: 5000,
    whatsapp_messages: 5000,
    sms_messages: 2000,
    courses: -1, // Ilimitado
    students: -1,
    storage_gb: 25,
    ai_image_generations: 100,
    business_emails: 10,
    business_domains: 1,
    business_email_gb: 1,
    automations_count: 20,
    pages: 50,
  },
  [PLANS.PRO]: {
    leads: -1, // Ilimitado
    users: 10,
    emails_per_month: -1,
    automation_runs: -1,
    whatsapp_messages: -1,
    sms_messages: -1,
    courses: -1,
    students: -1,
    storage_gb: 200,
    ai_image_generations: -1,
    business_emails: -1,
    business_domains: -1,
    business_email_gb: 10,
    automations_count: -1,
    pages: -1,
  }
}

// ============== PRECIOS ==============

export const PLAN_PRICES = {
  [PLANS.STARTER]: {
    monthly: 49,
    yearly: 490,
    currency: 'eur',
    stripePriceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_STARTER || 'price_starter'
  },
  [PLANS.GROWTH]: {
    monthly: 99,
    yearly: 990,
    currency: 'eur',
    stripePriceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_GROWTH || 'price_growth'
  },
  [PLANS.PRO]: {
    monthly: 199,
    yearly: 1990,
    currency: 'eur',
    stripePriceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_PRO || 'price_pro'
  }
}

// ============== FEATURES POR PLAN (para UI) ==============

export const PLAN_FEATURES = {
  [PLANS.STARTER]: [
    '2 usuarios incluidos',
    'Leads, Contactos, Empresas',
    'Pipeline de ventas',
    'Tareas',
    'Analytics básico',
    'Mensajes y Citas',
    'Catálogo',
    'Campañas básicas',
    'Email marketing básico',
    'Mi tarjeta digital',
    '3 automatizaciones',
  ],
  [PLANS.GROWTH]: [
    '5 usuarios incluidos',
    'Todo Starter +',
    'Cotizaciones y Contratos',
    'Órdenes de venta',
    'Pronósticos y Scoring',
    'Chatbot WhatsApp básico',
    'Campañas completas',
    'Email marketing completo',
    'CMS / Landing pages',
    '20 automatizaciones',
    'Academia (cursos + estudiantes)',
    'Integraciones',
  ],
  [PLANS.PRO]: [
    '10 usuarios incluidos',
    'Todo Growth +',
    'Chatbot WhatsApp avanzado',
    'Automatización de mensajes',
    'Campañas avanzadas',
    'Email marketing avanzado',
    'CMS / Landing pages',
    'Automatizaciones ilimitadas',
    'Academia ilimitada',
    'Integraciones completas + API',
  ]
}

// Lo que NO incluye cada plan
export const PLAN_EXCLUDED: Record<string, string[]> = {
  [PLANS.STARTER]: [
    'Contratos',
    'Cotizaciones',
    'Chatbot WhatsApp',
    'Academia (cursos)',
    'CMS / Landing pages',
    'Scoring',
    'Pronósticos',
  ],
  [PLANS.GROWTH]: [],
  [PLANS.PRO]: [],
}

// ============== ADD-ONS ==============

export interface AddOn {
  id: string
  nombre: string
  descripcion: string
  precio: number
  moneda: string
  intervalo: string // 'mes', 'usuario/mes', 'número'
  modulosDesbloqueados?: CrmModule[]   // módulos que activa
  limitesExtra?: Partial<typeof PLAN_LIMITS['starter']>  // límites extra
  icon: string
}

export const ADDONS: AddOn[] = [
  {
    id: 'addon_usuarios',
    nombre: 'Usuarios Adicionales',
    descripcion: 'Agregar un usuario extra al equipo',
    precio: 10,
    moneda: 'EUR',
    intervalo: 'usuario/mes',
    icon: '👤',
    limitesExtra: { users: 1 },
  },
  {
    id: 'addon_whatsapp',
    nombre: 'WhatsApp (Twilio)',
    descripcion: 'Número WhatsApp adicional para envío de mensajes',
    precio: 20,
    moneda: 'EUR',
    intervalo: 'número/mes',
    icon: '📱',
    modulosDesbloqueados: ['chatbot_whatsapp'],
  },
  {
    id: 'addon_academia',
    nombre: 'Academia Avanzada',
    descripcion: 'Cursos ilimitados, estudiantes ilimitados, certificados',
    precio: 29,
    moneda: 'EUR',
    intervalo: 'mes',
    icon: '🎓',
    modulosDesbloqueados: ['cursos', 'estudiantes'],
    limitesExtra: { courses: -1, students: -1 },
  },
  {
    id: 'addon_automatizacion_ia',
    nombre: 'Automatización IA',
    descripcion: 'Automatizaciones avanzadas con inteligencia artificial',
    precio: 39,
    moneda: 'EUR',
    intervalo: 'mes',
    icon: '🤖',
    modulosDesbloqueados: ['automatizaciones'],
    limitesExtra: { automation_runs: -1, automations_count: -1 },
  },
]

export const TRIAL_DAYS = 14

// ============== HELPERS ==============

export function isTrialActive(tenant: { trialEndsAt: Date | null, estado: string }): boolean {
  if (!tenant.trialEndsAt) return false
  return new Date() < new Date(tenant.trialEndsAt) && tenant.estado === 'trial'
}

export function getTrialDaysRemaining(trialEndsAt: Date | null): number {
  if (!trialEndsAt) return 0
  const now = new Date()
  const end = new Date(trialEndsAt)
  const diff = end.getTime() - now.getTime()
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)))
}

export async function getPlanConfig(planSlug: string) {
  try {
    // Only attempt DB fetch on server-side
    if (typeof window === 'undefined') {
      const { prisma } = await import('./db');
      const plan = await prisma.subscriptionPlan.findUnique({
        where: { slug: planSlug }
      });
      
      if (plan) {
        return {
          id: plan.slug,
          nombre: plan.nombre,
          precio: plan.precio,
          moneda: plan.moneda,
          intervalo: plan.intervalo,
          limites: {
            // Unify DB fields and raw_limits JSON for backward compatibility
            users: plan.limiteUsuarios,
            leads: plan.limiteLeads,
            storage_gb: plan.limiteStorage,
            courses: plan.limiteCursos,
            students: plan.limiteEstudiantes,
            ...(plan.features as any)?.raw_limits
          },
          modules: (plan.features as any)?.modules as CrmModule[] || PLAN_MODULES[planSlug] || PLAN_MODULES[PLANS.STARTER],
          stripePriceId: (plan.features as any)?.stripePriceId || '',
          branding: {
            whitelabel: plan.whitelabelHabilitado || ((plan.features as any)?.modules || []).includes('white_label'),
            customDomain: plan.dominioPersonalizadoHabilitado || ((plan.features as any)?.modules || []).includes('custom_domain')
          }
        };
      }
    }
  } catch (e) {
    console.error(`[lib/plans] Error fetching plan "${planSlug}" from DB:`, e);
  }

  // Fallback to hardcoded
  const key = planSlug.toUpperCase() as keyof typeof PLANS;
  const actualSlug = PLANS[key] || planSlug;
  
  return {
    id: actualSlug,
    nombre: actualSlug,
    precio: (PLAN_PRICES as any)[actualSlug]?.monthly || 0,
    moneda: (PLAN_PRICES as any)[actualSlug]?.currency || 'eur',
    intervalo: 'mensual',
    limites: PLAN_LIMITS[actualSlug as keyof typeof PLAN_LIMITS] || PLAN_LIMITS[PLANS.STARTER],
    modules: PLAN_MODULES[actualSlug] || PLAN_MODULES[PLANS.STARTER],
    stripePriceId: (PLAN_PRICES as any)[actualSlug]?.stripePriceId || ''
  };
}

export async function hasReachedLimit(
  usage: number,
  plan: string,
  limitType: string
): Promise<boolean> {
  const config = await getPlanConfig(plan);
  const limit = (config.limites as any)[limitType];
  if (limit === undefined || limit === -1) return false; // Ilimitado
  return usage >= limit;
}

/**
 * Obtiene los módulos activos para un tenant:
 * 1. Módulos del plan base (DB o Fallback)
 * 2. + Módulos desbloqueados por add-ons (via TenantFeature)
 * 3. - Módulos desactivados manualmente por admin (via TenantFeature habilitado=false)
 */
export async function getActiveModules(
  plan: string,
  tenantFeatures: Array<{ feature: string; habilitado: boolean }>
): Promise<CrmModule[]> {
  const normalizedPlan = plan.toLowerCase();
  const config = await getPlanConfig(normalizedPlan);
  const planModules = new Set<CrmModule>(config.modules);

  // Procesar overrides de TenantFeature
  for (const tf of tenantFeatures) {
    const moduleId = tf.feature as CrmModule
    if (tf.habilitado) {
      // Activado (add-on o override admin)
      planModules.add(moduleId)
    } else {
      // Desactivado por admin
      planModules.delete(moduleId)
    }
  }

  // FORCE: Asegurar que social_manager y cms estén presentes si el plan lo soporta según código
  // Esto soluciona problemas de sincronización con la base de datos de planes antigua.
  const hardcodedModules = PLAN_MODULES[normalizedPlan] || [];
  if (hardcodedModules.includes('social_manager')) {
    planModules.add('social_manager');
  }
  if (hardcodedModules.includes('cms')) {
    planModules.add('cms');
  }
  if (hardcodedModules.includes('builder_premium')) {
    planModules.add('builder_premium');
  }

  return Array.from(planModules)
}

/**
 * Verifica si un módulo está activo para un tenant
 */
export async function isModuleActive(
  moduleId: CrmModule,
  plan: string,
  tenantFeatures: Array<{ feature: string; habilitado: boolean }>
): Promise<boolean> {
  const activeModules = await getActiveModules(plan, tenantFeatures);
  return activeModules.includes(moduleId)
}
