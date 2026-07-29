// prisma: solo import dinámico dentro de getPlanConfig()

export const PLANS = {
  TRIAL: 'trial',
  ESENCIAL: 'esencial',
  PROFESIONAL: 'profesional',
  INFINITY: 'infinity',
  SCALE: 'scale',
  COMPLIANCE: 'compliance',
  AGENCY_SLOT: 'agency-slot',
  PRO_AGENCY: 'pro-agency',
  ACCOUNTING_SLOT: 'accounting-slot',
  PRO_ACCOUNTING: 'pro-accounting',
  BASICO: 'basico',
} as const

export type PlanType = typeof PLANS[keyof typeof PLANS]

export type CrmModule =
  | 'leads' | 'contactos' | 'empresas' | 'pipeline' | 'tareas' | 'analytics'
  | 'mensajes' | 'citas' | 'catalogo'
  | 'campanas' | 'email_marketing' | 'cms' | 'builder_premium'
  | 'automatizaciones'
  | 'cursos' | 'estudiantes'
  | 'cotizaciones' | 'contratos' | 'ordenes_venta' | 'pronosticos' | 'scoring'
  | 'chatbot_whatsapp'
  | 'integraciones'
  | 'mi_tarjeta'
  | 'equipo' | 'configuracion'
  | 'white_label' | 'custom_domain'
  | 'whatsapp' | 'meta_integration' | 'sms' | 'telegram'
  | 'google_calendar' | 'api_access'
  | 'telefonia'
  | 'social_manager'
  | 'rrhh' | 'finanzas' | 'finanzas_consolidado'
  | 'calidad' | 'produccion' | 'inventario' | 'proyectos'
  | 'taskforce' | 'activos' | 'conocimiento' | 'estrategia'
  | 'conciliacion' | 'logistica'
  | 'formularios'
  | 'ads'
  | 'agency'
  | 'compliance_pro'

export interface ModuleDefinition {
  id: CrmModule
  label: string
  description: string
  icon: string
  group: string
}

export const ALL_MODULES: ModuleDefinition[] = [
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
  { id: 'mensajes', label: 'Mensajes', description: 'Centro de mensajería', icon: '💬', group: 'Comunicación' },
  { id: 'citas', label: 'Citas', description: 'Agendamiento de citas', icon: '📅', group: 'Comunicación' },
  { id: 'catalogo', label: 'Catálogo', description: 'Catálogo de productos/servicios', icon: '🏷️', group: 'Comunicación' },
  { id: 'chatbot_whatsapp', label: 'Chatbot WhatsApp', description: 'Chatbot automatizado por WhatsApp', icon: '🤖', group: 'Comunicación' },
  { id: 'telefonia', label: 'Telefonía Inteligente', description: 'Integración con Zadarma para llamadas VoIP', icon: '📞', group: 'Comunicación' },
  { id: 'campanas', label: 'Campañas', description: 'Campañas de marketing multicanal', icon: '📣', group: 'Marketing' },
  { id: 'email_marketing', label: 'Email Marketing', description: 'Campañas de email con plantillas', icon: '✉️', group: 'Marketing' },
  { id: 'cms', label: 'Constructor Web', description: 'Landing pages con Puck CMS', icon: '🌐', group: 'Marketing' },
  { id: 'builder_premium', label: 'Constructor Premium', description: 'WebCreator avanzado con componentes pro', icon: '🏗️', group: 'Marketing' },
  { id: 'social_manager', label: 'Hub Social', description: 'Gestión y programación de redes sociales', icon: '📱', group: 'Marketing' },
  { id: 'formularios', label: 'Formularios', description: 'Creador de formularios inteligentes', icon: '📝', group: 'Marketing' },
  { id: 'ads', label: 'ADS Intelligence', description: 'Campañas de anuncios pagados con IA (Meta, Google, LinkedIn, TikTok)', icon: '📈', group: 'Marketing' },
  { id: 'cursos', label: 'Cursos', description: 'Gestión de cursos y contenido', icon: '📚', group: 'Academia' },
  { id: 'estudiantes', label: 'Estudiantes', description: 'Portal de estudiantes y certificados', icon: '🎓', group: 'Academia' },
  { id: 'automatizaciones', label: 'Automatizaciones', description: 'Motor de automatización visual', icon: '⚙️', group: 'Automatización' },
  { id: 'mi_tarjeta', label: 'Mi Tarjeta', description: 'Tarjeta digital de presentación', icon: '💳', group: 'Personal' },
  { id: 'integraciones', label: 'Integraciones', description: 'Conexiones con servicios externos', icon: '🔌', group: 'Administración' },
  { id: 'equipo', label: 'Equipo', description: 'Gestión del equipo y roles', icon: '👤', group: 'Administración' },
  { id: 'configuracion', label: 'Configuración', description: 'Ajustes generales de la cuenta', icon: '⚙️', group: 'Administración' },
  { id: 'white_label', label: 'Marca Blanca', description: 'Elimina el branding de Volkern', icon: '🏷️', group: 'Administración' },
  { id: 'custom_domain', label: 'Dominio Personalizado', description: 'Usa tu propio dominio', icon: '🌐', group: 'Administración' },
  { id: 'conocimiento', label: 'Conocimiento', description: 'Base de conocimientos y SOPs', icon: '🧠', group: 'Administración' },
  { id: 'agency', label: 'Agencia', description: 'Gestión de slots de cliente', icon: '🏢', group: 'Administración' },
  { id: 'compliance_pro', label: 'Compliance PRO', description: 'Trazabilidad total, gates obligatorios, score dashboard y alertas inteligentes', icon: '🛡️', group: 'Compliance' },
  { id: 'whatsapp', label: 'WhatsApp', description: 'Integración oficial con WhatsApp', icon: '📱', group: 'Integraciones' },
  { id: 'meta_integration', label: 'Meta (FB/IG)', description: 'Facebook e Instagram Messenger', icon: '♾️', group: 'Integraciones' },
  { id: 'telegram', label: 'Telegram', description: 'Integración con Telegram Bot', icon: '✈️', group: 'Integraciones' },
  { id: 'sms', label: 'SMS Gateway', description: 'Envío de notificaciones por SMS', icon: '💬', group: 'Integraciones' },
  { id: 'google_calendar', label: 'Google Calendar', description: 'Sincronización de citas y eventos', icon: '📅', group: 'Integraciones' },
  { id: 'api_access', label: 'Acceso a la API', description: 'Tokens de API para desarrolladores', icon: '🔑', group: 'Integraciones' },
  { id: 'rrhh', label: 'RRHH', description: 'Gestión de talento y nóminas', icon: '👥', group: 'ERP' },
  { id: 'finanzas', label: 'Finanzas', description: 'Contabilidad, IVA, balances', icon: '💰', group: 'ERP' },
  { id: 'finanzas_consolidado', label: 'Consolidado Financiero', description: 'Vista multi-tenant financiera', icon: '📊', group: 'ERP' },
  { id: 'calidad', label: 'Calidad', description: 'Control de calidad industrial', icon: '✅', group: 'ERP' },
  { id: 'produccion', label: 'Producción', description: 'Gestión de manufactura y BOM', icon: '🏭', group: 'ERP' },
  { id: 'inventario', label: 'Inventario', description: 'Gestión de almacenes y stock', icon: '📦', group: 'ERP' },
  { id: 'proyectos', label: 'Proyectos', description: 'Gestión de obras y proyectos', icon: '🏗️', group: 'ERP' },
  { id: 'taskforce', label: 'Taskforce', description: 'Gestión de equipos operativos', icon: '👷', group: 'ERP' },
  { id: 'activos', label: 'Activos', description: 'Gestión de maquinaria y activos fijos', icon: '🚜', group: 'ERP' },
  { id: 'conciliacion', label: 'Conciliación Bancaria', description: 'Sincronización con bancos', icon: '🏦', group: 'ERP' },
  { id: 'logistica', label: 'Logística', description: 'Flota, envíos, almacenes', icon: '🚚', group: 'ERP' },
  { id: 'estrategia', label: 'Estrategia', description: 'Planificación estratégica y KPIs', icon: '🎯', group: 'Estrategia' },
]

// ALL_FEATURES_SET excluye compliance_pro para evitar duplicados en planes que lo agregan explícitamente
const ALL_FEATURES_SET: CrmModule[] = ALL_MODULES
  .map(m => m.id)
  .filter(id => id !== 'compliance_pro')

export const PLAN_MODULES: Record<string, CrmModule[]> = {
  [PLANS.TRIAL]: [...ALL_FEATURES_SET, 'compliance_pro'],
  [PLANS.ESENCIAL]: ALL_FEATURES_SET,
  [PLANS.PROFESIONAL]: [...ALL_FEATURES_SET, 'compliance_pro'],
  [PLANS.INFINITY]: [...ALL_FEATURES_SET, 'compliance_pro'],
  [PLANS.SCALE]: ALL_FEATURES_SET,
  [PLANS.COMPLIANCE]: [...ALL_FEATURES_SET, 'compliance_pro'],
  [PLANS.BASICO]: [
    'leads', 'contactos', 'empresas', 'pipeline', 'tareas', 'analytics',
    'mensajes', 'citas', 'catalogo',
    'ads',
    'mi_tarjeta',
    'equipo', 'configuracion',
  ],
  [PLANS.AGENCY_SLOT]: [
    'leads', 'contactos', 'empresas', 'pipeline', 'tareas', 'analytics',
    'mensajes', 'citas', 'catalogo',
    'campanas', 'email_marketing', 'cms', 'builder_premium',
    'ads',
    'mi_tarjeta',
    'equipo', 'configuracion',
  ],
  [PLANS.PRO_AGENCY]: ALL_FEATURES_SET,
  [PLANS.ACCOUNTING_SLOT]: [
    'leads', 'contactos', 'empresas', 'pipeline', 'tareas', 'analytics',
    'mensajes', 'citas', 'catalogo',
    'cotizaciones', 'contratos', 'ordenes_venta',
    'finanzas', 'conciliacion',
    'automatizaciones',
    'ads',
    'mi_tarjeta',
    'equipo', 'configuracion',
    'conocimiento',
    'chatbot_whatsapp',
  ],
  [PLANS.PRO_ACCOUNTING]: [
    'leads', 'contactos', 'empresas', 'pipeline', 'tareas', 'analytics',
    'mensajes', 'citas', 'catalogo',
    'cotizaciones', 'contratos', 'ordenes_venta', 'pronosticos', 'scoring',
    'finanzas', 'conciliacion',
    'automatizaciones',
    'ads',
    'mi_tarjeta',
    'equipo', 'configuracion',
    'conocimiento',
    'chatbot_whatsapp',
    'rrhh', 'finanzas_consolidado',
    'telefonia',
    'white_label', 'custom_domain',
    'agency',
  ],
}

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
    catalogo_items: 20,
    published_pages: 1,
    invoices: 5,
    contratos_sign: 2,
  },
  [PLANS.ESENCIAL]: {
    leads: 1000,
    users: 2,
    emails_per_month: 2500,
    automation_runs: 500,
    whatsapp_messages: 500,
    sms_messages: 250,
    courses: 5,
    students: 50,
    storage_gb: 5,
    ai_image_generations: 10,
    business_emails: 0,
    business_domains: 0,
    business_email_gb: 0,
    automations_count: 5,
    pages: 5,
    catalogo_items: 100,
    published_pages: 3,
    invoices: 50,
    contratos_sign: 20,
    compliance_mode: false,
  },
  [PLANS.PROFESIONAL]: {
    leads: 5000,
    users: 5,
    emails_per_month: 10000,
    automation_runs: 5000,
    whatsapp_messages: 2000,
    sms_messages: 1000,
    courses: 20,
    students: 500,
    storage_gb: 25,
    ai_image_generations: 50,
    business_emails: 10,
    business_domains: 1,
    business_email_gb: 1,
    automations_count: 20,
    pages: 20,
    catalogo_items: 500,
    published_pages: 10,
    invoices: 500,
    contratos_sign: 200,
    compliance_mode: false,
  },
  [PLANS.INFINITY]: {
    leads: -1,
    users: 15,
    emails_per_month: -1,
    automation_runs: -1,
    whatsapp_messages: 10000,
    sms_messages: 5000,
    courses: -1,
    students: -1,
    storage_gb: 100,
    ai_image_generations: -1,
    business_emails: -1,
    business_domains: -1,
    business_email_gb: 10,
    automations_count: -1,
    pages: -1,
    catalogo_items: -1,
    published_pages: -1,
    invoices: -1,
    contratos_sign: -1,
    compliance_mode: true,
  },
  [PLANS.SCALE]: {
    leads: -1,
    users: 99,
    emails_per_month: -1,
    automation_runs: -1,
    whatsapp_messages: -1,
    sms_messages: -1,
    courses: -1,
    students: -1,
    storage_gb: 100,
    ai_image_generations: -1,
    business_emails: -1,
    business_domains: -1,
    business_email_gb: 10,
    automations_count: -1,
    pages: -1,
    catalogo_items: -1,
    published_pages: -1,
    invoices: -1,
    contratos_sign: -1,
    compliance_mode: false,
  },
  [PLANS.COMPLIANCE]: {
    leads: -1,
    users: 99,
    emails_per_month: -1,
    automation_runs: -1,
    whatsapp_messages: -1,
    sms_messages: -1,
    courses: -1,
    students: -1,
    storage_gb: 250,
    ai_image_generations: -1,
    business_emails: -1,
    business_domains: -1,
    business_email_gb: 25,
    automations_count: -1,
    pages: -1,
    catalogo_items: -1,
    published_pages: -1,
    invoices: -1,
    contratos_sign: -1,
    compliance_mode: true,
  },
  [PLANS.BASICO]: {
    leads: 1000,
    users: 2,
    emails_per_month: 1000,
    automation_runs: 0,
    whatsapp_messages: 0,
    sms_messages: 0,
    courses: 0,
    students: 0,
    storage_gb: 2,
    ai_image_generations: 0,
    business_emails: 0,
    business_domains: 0,
    business_email_gb: 0,
    automations_count: 0,
    pages: 3,
    catalogo_items: 30,
    published_pages: 1,
    invoices: 20,
    contratos_sign: 10,
  },
  [PLANS.AGENCY_SLOT]: {
    leads: 5000,
    users: 5,
    emails_per_month: 10000,
    automation_runs: 1000,
    whatsapp_messages: 1000,
    sms_messages: 500,
    courses: 10,
    students: 500,
    storage_gb: 10,
    ai_image_generations: 50,
    business_emails: 0,
    business_domains: 0,
    business_email_gb: 0,
    automations_count: 10,
    pages: 10,
    catalogo_items: 200,
    published_pages: 10,
    invoices: 200,
    contratos_sign: 100,
  },
  [PLANS.PRO_AGENCY]: {
    leads: -1,
    users: -1,
    emails_per_month: -1,
    automation_runs: -1,
    whatsapp_messages: -1,
    sms_messages: -1,
    courses: -1,
    students: -1,
    storage_gb: 1000,
    ai_image_generations: -1,
    business_emails: -1,
    business_domains: -1,
    business_email_gb: 50,
    automations_count: -1,
    pages: -1,
    catalogo_items: -1,
    published_pages: -1,
    invoices: -1,
    contratos_sign: -1,
  },
  [PLANS.ACCOUNTING_SLOT]: {
    leads: 5000,
    users: 5,
    emails_per_month: 10000,
    automation_runs: 1000,
    whatsapp_messages: 1000,
    sms_messages: 500,
    courses: 10,
    students: 500,
    storage_gb: 10,
    ai_image_generations: 50,
    business_emails: 0,
    business_domains: 0,
    business_email_gb: 0,
    automations_count: 10,
    pages: 10,
    catalogo_items: 200,
    published_pages: 10,
    invoices: 200,
    contratos_sign: 100,
  },
  [PLANS.PRO_ACCOUNTING]: {
    leads: -1,
    users: -1,
    emails_per_month: -1,
    automation_runs: -1,
    whatsapp_messages: -1,
    sms_messages: -1,
    courses: -1,
    students: -1,
    storage_gb: 1000,
    ai_image_generations: -1,
    business_emails: -1,
    business_domains: -1,
    business_email_gb: 50,
    automations_count: -1,
    pages: -1,
    catalogo_items: -1,
    published_pages: -1,
    invoices: -1,
    contratos_sign: -1,
  },
}

export const PLAN_PRICES = {
  [PLANS.ESENCIAL]: {
    monthly: 69,
    yearly: 662,
    currency: 'eur',
    stripePriceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_ESENCIAL_MONTHLY || '',
    stripePriceYearlyId: process.env.NEXT_PUBLIC_STRIPE_PRICE_ESENCIAL_YEARLY || '',
  },
  [PLANS.PROFESIONAL]: {
    monthly: 149,
    yearly: 1430,
    currency: 'eur',
    stripePriceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_PROFESIONAL_MONTHLY || '',
    stripePriceYearlyId: process.env.NEXT_PUBLIC_STRIPE_PRICE_PROFESIONAL_YEARLY || '',
  },
  [PLANS.INFINITY]: {
    monthly: 299,
    yearly: 2870,
    currency: 'eur',
    stripePriceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_INFINITY_MONTHLY || '',
    stripePriceYearlyId: process.env.NEXT_PUBLIC_STRIPE_PRICE_INFINITY_YEARLY || '',
  },
  [PLANS.SCALE]: {
    monthly: 0,
    yearly: 0,
    currency: 'eur',
    stripePriceId: '',
    stripePriceYearlyId: '',
  },
  [PLANS.COMPLIANCE]: {
    monthly: 0,
    yearly: 0,
    currency: 'eur',
    stripePriceId: '',
    stripePriceYearlyId: '',
  },
}

export const PLAN_FEATURES: Record<string, string[]> = {
  [PLANS.ESENCIAL]: [
    '2 usuarios incluidos',
    '1.000 contactos',
    'CRM completo: leads, pipeline, tareas, analytics',
    'Ventas: cotizaciones, contratos, facturación',
    'Marketing: campañas, email, RRSS, formularios',
    'Web Creator: 5 landing pages',
    'Chatbot IA: 500 conversaciones/mes',
    'Contabilidad: PGC, asientos, IVA, Verifactu',
    'LMS: 5 cursos, 50 estudiantes',
    'RRHH, Logística, Producción, Proyectos',
    'Conciliación bancaria',
    'Portal de cliente',
    'Soporte por email',
  ],
  [PLANS.PROFESIONAL]: [
    '5 usuarios incluidos',
    '5.000 contactos',
    'Todo Esencial +',
    'Web Creator: 20 landing pages',
    'Chatbot IA: 2.000 conversaciones/mes',
    'LMS: 20 cursos, 500 estudiantes',
    'Automatizaciones: 20 activas',
    '10.000 emails marketing/mes',
    'Integraciones y API',
    'Business email: 10 cuentas',
    'Soporte prioritario',
  ],
  [PLANS.INFINITY]: [
    '15 usuarios incluidos',
    'Contactos ilimitados',
    'Todo Profesional +',
    'Web Creator: páginas ilimitadas',
    'Chatbot IA: 10.000 conversaciones/mes',
    'LMS: cursos y estudiantes ilimitados',
    'Automatizaciones ilimitadas',
    'Emails marketing ilimitados',
    'Facturas ilimitadas',
    'Dominio personalizado (tuyo)',
    '100 GB almacenamiento',
    'Soporte dedicado',
  ],
  [PLANS.TRIAL]: [
    '100 contactos',
    '2 usuarios',
    'CRM completo',
    'Todas las funcionalidades',
    '14 días de prueba',
  ],
  [PLANS.SCALE]: [
    'Usuarios y contactos ilimitados',
    'CRM completo: leads, pipeline, tareas, analytics',
    'Ventas: cotizaciones, contratos, facturación',
    'Marketing: campañas, email, RRSS, formularios',
    'Web Creator: landing pages ilimitadas',
    'Chatbot IA: conversaciones ilimitadas',
    'LMS: cursos y estudiantes ilimitados',
    'Automatizaciones ilimitadas',
    'RRHH, Logística, Producción, Proyectos',
    'Conciliación bancaria',
    'Portal de cliente',
    'Soporte prioritario',
  ],
  [PLANS.COMPLIANCE]: [
    'Todo Scale +',
    '🔒 Modo Compliance activado',
    'Auditoría completa',
    'Trazabilidad de acciones',
    'Control operativo',
    'Validaciones internas',
    'Gestión documental certificada',
    'Preparación fiscal',
    'Webhooks avanzados',
    'Soporte dedicado',
  ],
}

export interface AddOn {
  id: string
  nombre: string
  descripcion: string
  precio: number
  moneda: string
  intervalo: string
  limitesExtra?: Partial<typeof PLAN_LIMITS['esencial']>
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
    id: 'compliance_pro',
    nombre: 'Compliance PRO',
    descripcion: 'Trazabilidad total, gates obligatorios, score dashboard, alertas inteligentes y certificación digital',
    precio: 149,
    moneda: 'EUR',
    intervalo: 'mes',
    icon: '🛡️',
    limitesExtra: { compliance_mode: true },
  },
]

export const TRIAL_DAYS = 14

export function isTrialActive(tenant: { trialEndsAt: Date | null; estado: string }): boolean {
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
    if (typeof window === 'undefined') {
      const { prisma } = await import('./db')
      const plan = await prisma.subscriptionPlan.findUnique({
        where: { slug: planSlug }
      })
      if (plan) {
        return {
          id: plan.slug,
          nombre: plan.nombre,
          precio: plan.precio,
          moneda: plan.moneda,
          intervalo: plan.intervalo,
          limites: {
            users: plan.limiteUsuarios,
            leads: plan.limiteLeads,
            storage_gb: plan.limiteStorage,
            courses: plan.limiteCursos,
            students: plan.limiteEstudiantes,
            ...(plan.features as any)?.raw_limits
          },
          modules: (plan.features as any)?.modules as CrmModule[] || PLAN_MODULES[planSlug] || PLAN_MODULES[PLANS.ESENCIAL],
          stripePriceId: (plan.features as any)?.stripePriceId || '',
          stripePriceYearlyId: (plan.features as any)?.stripePriceYearlyId || '',
          branding: {
            whitelabel: plan.whitelabelHabilitado || ((plan.features as any)?.modules || []).includes('white_label'),
            customDomain: plan.dominioPersonalizadoHabilitado || ((plan.features as any)?.modules || []).includes('custom_domain')
          }
        }
      }
    }
  } catch (e) {
    console.error(`[lib/plans] Error fetching plan "${planSlug}" from DB:`, e)
  }

  const normalizedSlug = planSlug.toLowerCase()
  const priceConfig = (PLAN_PRICES as any)[normalizedSlug]

  return {
    id: normalizedSlug,
    nombre: normalizedSlug === 'esencial' ? 'Esencial' : normalizedSlug === 'profesional' ? 'Profesional' : normalizedSlug === 'infinity' ? 'Infinity' : normalizedSlug === 'scale' ? 'Scale' : normalizedSlug === 'compliance' ? 'Compliance Pro' : normalizedSlug,
    precio: priceConfig?.monthly || 0,
    moneda: priceConfig?.currency || 'eur',
    intervalo: 'mensual',
    limites: PLAN_LIMITS[normalizedSlug as keyof typeof PLAN_LIMITS] || PLAN_LIMITS[PLANS.ESENCIAL],
    modules: PLAN_MODULES[normalizedSlug] || PLAN_MODULES[PLANS.ESENCIAL],
    stripePriceId: priceConfig?.stripePriceId || '',
    stripePriceYearlyId: priceConfig?.stripePriceYearlyId || '',
  }
}

export async function hasReachedLimit(
  usage: number,
  plan: string,
  limitType: string
): Promise<boolean> {
  const config = await getPlanConfig(plan)
  const limit = (config.limites as any)[limitType]
  if (limit === undefined || limit === -1) return false
  return usage >= limit
}

export async function getActiveModules(
  plan: string,
  tenantFeatures: Array<{ feature: string; habilitado: boolean }>
): Promise<CrmModule[]> {
  const normalizedPlan = plan.toLowerCase()
  const config = await getPlanConfig(normalizedPlan)
  const planModules = new Set<CrmModule>(config.modules)

  for (const tf of tenantFeatures) {
    const moduleId = tf.feature as CrmModule
    if (tf.habilitado) {
      planModules.add(moduleId)
    } else {
      planModules.delete(moduleId)
    }
  }

  if (planModules.has('estrategia') && !planModules.has('proyectos')) {
    planModules.delete('estrategia')
  }

  return Array.from(planModules)
}

export async function isModuleActive(
  moduleId: CrmModule,
  plan: string,
  tenantFeatures: Array<{ feature: string; habilitado: boolean }>
): Promise<boolean> {
  const activeModules = await getActiveModules(plan, tenantFeatures)
  return activeModules.includes(moduleId)
}
