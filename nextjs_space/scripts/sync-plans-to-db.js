const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Hardcoded plans matching lib/plans.ts exactly
const PLANS = {
  TRIAL: 'trial',
  STARTER: 'starter',
  GROWTH: 'growth',
  PRO: 'pro'
};

const PLAN_LIMITS = {
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
    automations_count: 0,
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
    automations_count: 3,
  },
  [PLANS.GROWTH]: {
    leads: 10000,
    users: 5,
    emails_per_month: 20000,
    automation_runs: 5000,
    whatsapp_messages: 5000,
    sms_messages: 2000,
    courses: -1,
    students: -1,
    storage_gb: 25,
    ai_image_generations: 100,
    automations_count: 20,
  },
  [PLANS.PRO]: {
    leads: -1,
    users: 10,
    emails_per_month: -1,
    automation_runs: -1,
    whatsapp_messages: -1,
    sms_messages: -1,
    courses: -1,
    students: -1,
    storage_gb: 200,
    ai_image_generations: -1,
    automations_count: -1,
  }
};

const PLAN_PRICES = {
  [PLANS.STARTER]: { monthly: 49, currency: 'EUR', stripePriceId: 'price_starter' },
  [PLANS.GROWTH]: { monthly: 99, currency: 'EUR', stripePriceId: 'price_growth' },
  [PLANS.PRO]: { monthly: 199, currency: 'EUR', stripePriceId: 'price_pro' },
  [PLANS.TRIAL]: { monthly: 0, currency: 'EUR', stripePriceId: null }
};

const PLAN_MODULES = {
    [PLANS.TRIAL]: ['leads', 'contactos', 'empresas', 'pipeline', 'tareas', 'analytics', 'mensajes', 'citas', 'catalogo', 'campanas', 'email_marketing', 'mi_tarjeta', 'equipo', 'configuracion'],
    [PLANS.STARTER]: ['leads', 'contactos', 'empresas', 'pipeline', 'tareas', 'analytics', 'mensajes', 'citas', 'catalogo', 'campanas', 'email_marketing', 'mi_tarjeta', 'equipo', 'configuracion'],
    [PLANS.GROWTH]: ['leads', 'contactos', 'empresas', 'pipeline', 'tareas', 'analytics', 'cotizaciones', 'contratos', 'ordenes_venta', 'pronosticos', 'scoring', 'mensajes', 'citas', 'catalogo', 'chatbot_whatsapp', 'campanas', 'email_marketing', 'cms', 'automatizaciones', 'cursos', 'estudiantes', 'mi_tarjeta', 'integraciones', 'equipo', 'configuracion'],
    [PLANS.PRO]: ['leads', 'contactos', 'empresas', 'pipeline', 'tareas', 'analytics', 'cotizaciones', 'contratos', 'ordenes_venta', 'pronosticos', 'scoring', 'mensajes', 'citas', 'catalogo', 'chatbot_whatsapp', 'campanas', 'email_marketing', 'cms', 'automatizaciones', 'cursos', 'estudiantes', 'mi_tarjeta', 'integraciones', 'equipo', 'configuracion'],
};

async function main() {
  console.log('--- Iniciando Sincronización de Planes ---');

  for (const slug of Object.values(PLANS)) {
    const limits = PLAN_LIMITS[slug];
    const price = PLAN_PRICES[slug];
    const modules = PLAN_MODULES[slug];

    const planData = {
      nombre: slug.charAt(0).toUpperCase() + slug.slice(1),
      slug: slug,
      precio: price.monthly,
      moneda: price.currency,
      intervalo: 'mensual',
      limiteUsuarios: limits.users,
      limiteLeads: limits.leads,
      limiteCursos: limits.courses || 0,
      limiteEstudiantes: limits.students || 0,
      limiteStorage: limits.storage_gb,
      // Boolean Flags
      whatsappHabilitado: modules.includes('chatbot_whatsapp'),
      emailHabilitado: modules.includes('email_marketing'),
      lmsHabilitado: modules.includes('cursos'),
      pageBuilderHabilitado: modules.includes('cms'),
      automationsHabilitado: modules.includes('automatizaciones'),
      apiAccessHabilitado: slug === 'pro',
      // Metadata
      features: {
        raw_limits: limits,
        modules: modules,
        stripePriceId: price.stripePriceId,
        ui_features: [] // To be filled by UI logic if needed
      }
    };

    console.log(`Syncing plan: ${slug}...`);
    await prisma.subscriptionPlan.upsert({
      where: { slug: slug },
      update: planData,
      create: planData
    });
  }

  console.log('--- Sincronización Completada ---');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
