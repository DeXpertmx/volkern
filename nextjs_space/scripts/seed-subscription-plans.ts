/**
 * Seed: Crea/actualiza registros SubscriptionPlan para todos los planes del sistema
 *
 * Planes:
 *   - esencial:   ALL_FEATURES_SET (sin compliance), €69/mo, 2 users, 1K leads
 *   - profesional: ALL_FEATURES_SET + compliance_pro, €149/mo, 5 users, 5K leads
 *   - infinity:   ALL_FEATURES_SET + compliance_pro, €299/mo, 15 users, leads -1
 *   - scale:      ALL_FEATURES_SET (sin compliance), dinámico, 99 users, leads -1
 *   - compliance:  ALL_FEATURES_SET + compliance_pro, dinámico, 99 users, leads -1, 250GB
 *
 * Uso: npx tsx scripts/seed-subscription-plans.ts
 * Seguro de ejecutar múltiples veces (upsert por slug).
 *
 * Mantener en sync con ALL_MODULES, PLAN_LIMITS, PLAN_PRICES en lib/plans.ts
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// Los módulos completos (ALL_FEATURES_SET) de lib/plans.ts
// Si agregas módulos nuevos en lib/plans.ts, actualiza también esta lista.
const ALL_FEATURES_SET = [
  'leads', 'contactos', 'empresas', 'pipeline', 'tareas', 'analytics',
  'cotizaciones', 'contratos', 'ordenes_venta', 'pronosticos', 'scoring',
  'mensajes', 'citas', 'catalogo', 'chatbot_whatsapp', 'telefonia',
  'campanas', 'email_marketing', 'cms', 'builder_premium', 'social_manager', 'formularios',
  'cursos', 'estudiantes',
  'automatizaciones',
  'mi_tarjeta',
  'integraciones', 'equipo', 'configuracion', 'white_label', 'custom_domain', 'conocimiento', 'agency',
  'compliance_pro',
  'whatsapp', 'meta_integration', 'telegram', 'sms', 'google_calendar', 'api_access',
  'rrhh', 'finanzas', 'finanzas_consolidado',
  'calidad', 'produccion', 'inventario', 'proyectos', 'taskforce', 'activos', 'conciliacion', 'logistica',
  'estrategia',
]

interface PlanSeed {
  slug: string
  nombre: string
  descripcion: string
  precio: number
  moneda: string
  intervalo: string
  limiteUsuarios: number
  limiteLeads: number
  limiteStorage: number
  limiteCursos: number
  limiteEstudiantes: number
  features: Record<string, any>
  whatsappHabilitado: boolean
  emailHabilitado: boolean
  smsHabilitado: boolean
  automationsHabilitado: boolean
  campaignsHabilitado: boolean
  whitelabelHabilitado: boolean
  dominioPersonalizadoHabilitado: boolean
  apiAccessHabilitado: boolean
  lmsHabilitado: boolean
  esPublico: boolean
  esPopular: boolean
  ordenamiento: number
}

const SEED_PLANS: PlanSeed[] = [
  // ── Planes legacy (ya no se venden, pero deben existir en BD para consistencia) ──
  {
    slug: 'esencial',
    nombre: 'Esencial',
    descripcion: 'Plan básico. CRM completo, marketing, chat, LMS, ERP y automatizaciones.',
    precio: 69,
    moneda: 'EUR',
    intervalo: 'mensual',
    limiteUsuarios: 2,
    limiteLeads: 1000,
    limiteStorage: 5,
    limiteCursos: 5,
    limiteEstudiantes: 50,
    features: {
      modules: ALL_FEATURES_SET.filter(m => m !== 'compliance_pro'),
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
      ui_features: [
        '2 usuarios incluidos',
        '1.000 contactos',
        'CRM completo: leads, pipeline, tareas, analytics',
        'Ventas: cotizaciones, contratos, facturación',
        'Marketing: campañas, email, RRSS, formularios',
        'Web Creator: 5 landing pages',
        'Chatbot IA: 500 conversaciones/mes',
        'LMS: 5 cursos, 50 estudiantes',
        'Automatizaciones: 5 activas',
        'Conciliación bancaria',
        'Soporte por email',
      ],
    },
    whatsappHabilitado: true,
    emailHabilitado: true,
    smsHabilitado: true,
    automationsHabilitado: true,
    campaignsHabilitado: true,
    whitelabelHabilitado: false,
    dominioPersonalizadoHabilitado: false,
    apiAccessHabilitado: true,
    lmsHabilitado: true,
    esPublico: false,  // Legacy — no mostrar en pricing público
    esPopular: false,
    ordenamiento: 10,
  },
  {
    slug: 'profesional',
    nombre: 'Profesional',
    descripcion: 'Plan profesional. Más usuarios, contactos y funcionalidades premium.',
    precio: 149,
    moneda: 'EUR',
    intervalo: 'mensual',
    limiteUsuarios: 5,
    limiteLeads: 5000,
    limiteStorage: 25,
    limiteCursos: 20,
    limiteEstudiantes: 500,
    features: {
      modules: [...ALL_FEATURES_SET], // Incluye compliance_pro
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
      ui_features: [
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
    },
    whatsappHabilitado: true,
    emailHabilitado: true,
    smsHabilitado: true,
    automationsHabilitado: true,
    campaignsHabilitado: true,
    whitelabelHabilitado: false,
    dominioPersonalizadoHabilitado: false,
    apiAccessHabilitado: true,
    lmsHabilitado: true,
    esPublico: false,
    esPopular: false,
    ordenamiento: 20,
  },
  {
    slug: 'infinity',
    nombre: 'Infinity',
    descripcion: 'Plan ilimitado. Todo incluido sin restricciones.',
    precio: 299,
    moneda: 'EUR',
    intervalo: 'mensual',
    limiteUsuarios: 15,
    limiteLeads: -1,
    limiteStorage: 100,
    limiteCursos: -1,
    limiteEstudiantes: -1,
    features: {
      modules: [...ALL_FEATURES_SET], // Incluye compliance_pro
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
      ui_features: [
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
    },
    whatsappHabilitado: true,
    emailHabilitado: true,
    smsHabilitado: true,
    automationsHabilitado: true,
    campaignsHabilitado: true,
    whitelabelHabilitado: true,
    dominioPersonalizadoHabilitado: true,
    apiAccessHabilitado: true,
    lmsHabilitado: true,
    esPublico: false,
    esPopular: false,
    ordenamiento: 30,
  },

  // ── Planes nuevo modelo (precio dinámico) ──
  {
    slug: 'scale',
    nombre: 'Scale',
    descripcion: 'Plan base ilimitado. CRM completo, marketing, automatizaciones, LMS, ERP y más.',
    precio: 0, // Dinámico — se calcula en checkout
    moneda: 'EUR',
    intervalo: 'mensual',
    limiteUsuarios: 99,
    limiteLeads: -1,
    limiteStorage: 100,
    limiteCursos: -1,
    limiteEstudiantes: -1,
    features: {
      modules: ALL_FEATURES_SET.filter(m => m !== 'compliance_pro'),
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
      ui_features: [
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
    },
    whatsappHabilitado: true,
    emailHabilitado: true,
    smsHabilitado: true,
    automationsHabilitado: true,
    campaignsHabilitado: true,
    whitelabelHabilitado: true,
    dominioPersonalizadoHabilitado: true,
    apiAccessHabilitado: true,
    lmsHabilitado: true,
    esPublico: false,
    esPopular: true,
    ordenamiento: 60,
  },
  {
    slug: 'compliance',
    nombre: 'Compliance Pro',
    descripcion: 'Plan con Compliance PRO. Todo Scale más trazabilidad total, gates obligatorios y certificación digital.',
    precio: 0, // Dinámico
    moneda: 'EUR',
    intervalo: 'mensual',
    limiteUsuarios: 99,
    limiteLeads: -1,
    limiteStorage: 250,
    limiteCursos: -1,
    limiteEstudiantes: -1,
    features: {
      modules: [...ALL_FEATURES_SET], // Incluye compliance_pro
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
      ui_features: [
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
    },
    whatsappHabilitado: true,
    emailHabilitado: true,
    smsHabilitado: true,
    automationsHabilitado: true,
    campaignsHabilitado: true,
    whitelabelHabilitado: true,
    dominioPersonalizadoHabilitado: true,
    apiAccessHabilitado: true,
    lmsHabilitado: true,
    esPublico: false,
    esPopular: false,
    ordenamiento: 70,
  },
]

async function main() {
  console.log('=== Seed: SubscriptionPlan records (todos los planes) ===\n')

  let created = 0
  let updated = 0

  for (const plan of SEED_PLANS) {
    const existing = await prisma.subscriptionPlan.findUnique({
      where: { slug: plan.slug },
    })

    const data = {
      nombre: plan.nombre,
      descripcion: plan.descripcion,
      precio: plan.precio,
      moneda: plan.moneda,
      intervalo: plan.intervalo,
      precioSetup: null,
      limiteUsuarios: plan.limiteUsuarios,
      limiteLeads: plan.limiteLeads,
      limiteCursos: plan.limiteCursos,
      limiteEstudiantes: plan.limiteEstudiantes,
      limiteStorage: plan.limiteStorage,
      whatsappHabilitado: plan.whatsappHabilitado,
      emailHabilitado: plan.emailHabilitado,
      smsHabilitado: plan.smsHabilitado,
      telegramHabilitado: true,
      facebookHabilitado: true,
      instagramHabilitado: true,
      lmsHabilitado: plan.lmsHabilitado,
      automationsHabilitado: plan.automationsHabilitado,
      campaignsHabilitado: plan.campaignsHabilitado,
      whitelabelHabilitado: plan.whitelabelHabilitado,
      dominioPersonalizadoHabilitado: plan.dominioPersonalizadoHabilitado,
      apiAccessHabilitado: plan.apiAccessHabilitado,
      features: plan.features,
      activo: true,
      esPublico: plan.esPublico,
      esPopular: plan.esPopular,
      ordenamiento: plan.ordenamiento,
    }

    if (existing) {
      await prisma.subscriptionPlan.update({
        where: { slug: plan.slug },
        data,
      })
      updated++
      console.log(`  🔄 ${plan.slug} (${plan.nombre}): actualizado`)
    } else {
      const created_record = await prisma.subscriptionPlan.create({
        data: {
          ...data,
          slug: plan.slug,
        },
      })
      created++
      console.log(`  ✅ ${plan.slug} (${plan.nombre}): creado (ID: ${created_record.id.slice(0, 8)})`)
    }
  }

  console.log(`\n=== Resumen ===`)
  console.log(`  Creados:    ${created}`)
  console.log(`  Actualizados: ${updated}`)
  console.log(`  Total:      ${SEED_PLANS.length}`)

  // Verificación exhaustiva
  console.log('\n=== Verificación ===')
  const slugs = SEED_PLANS.map(p => p.slug)
  const verifyPlans = await prisma.subscriptionPlan.findMany({
    where: { slug: { in: slugs } },
    orderBy: { ordenamiento: 'asc' },
  })
  for (const p of verifyPlans) {
    const feat = p.features as any
    const modules = Array.isArray(feat?.modules) ? feat.modules.length : 0
    const rawLimits = feat?.raw_limits || {}
    const hasComplianceMode = rawLimits.compliance_mode !== undefined
    console.log(`  ${p.slug.padEnd(14)} | ${p.nombre.padEnd(16)} | users=${String(p.limiteUsuarios).padEnd(4)} | leads=${String(p.limiteLeads).padEnd(5)} | storage=${String(p.limiteStorage).padEnd(4)}GB | modules=${modules} | compliance=${rawLimits.compliance_mode} | precio=${p.precio}€ | public=${p.esPublico}`)
  }

  // Verificar que getPlanConfig funciona con DB para todos los planes
  console.log('\n=== Verificación getPlanConfig via DB ===')
  for (const plan of verifyPlans) {
    const { getPlanConfig: getPC } = await import('../lib/subscription')
    try {
      const config = await getPC(plan.slug)
      if (config) {
        console.log(`  ✅ ${plan.slug}: OK — nombre=${config.nombre}, modules=${config.modules.length}, whitelabel=${config.branding?.whitelabel}`)
      } else {
        console.log(`  ❌ ${plan.slug}: config is null`)
      }
    } catch (e: any) {
      console.log(`  ❌ ${plan.slug}: ERROR — ${e.message}`)
    }
  }

  await prisma.$disconnect()
  console.log('\n✅ Seed completado.')
}

main().catch((e) => {
  console.error('Error fatal:', e)
  prisma.$disconnect()
  process.exit(1)
})
