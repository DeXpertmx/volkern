/**
 * Seed: Crea/actualiza registros SubscriptionPlan para 'scale' y 'compliance'
 *
 * Estos registros son necesarios para consistencia en BD.
 * Si no existen, getPlanConfig() usa los hardcoded de lib/plans.ts como fallback.
 * Al crearlos, mapDbPlanToConfig() debe producir exactamente la misma config.
 *
 * Uso: npx tsx scripts/seed-subscription-plans.ts
 * Seguro de ejecutar múltiples veces (upsert por slug).
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// Los módulos completos (ALL_FEATURES_SET) de lib/plans.ts
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
  // Boolean flags
  whatsappHabilitado: boolean
  emailHabilitado: boolean
  smsHabilitado: boolean
  automationsHabilitado: boolean
  campaignsHabilitado: boolean
  whitelabelHabilitado: boolean
  dominioPersonalizadoHabilitado: boolean
  apiAccessHabilitado: boolean
  lmsHabilitado: boolean
  ordenamiento: number
  esPopular: boolean
}

const SEED_PLANS: PlanSeed[] = [
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
    ordenamiento: 60,
    esPopular: true,
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
    ordenamiento: 70,
    esPopular: false,
  },
]

async function main() {
  console.log('=== Seed: SubscriptionPlan records (scale/compliance) ===\n')

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
      esPublico: false, // No se muestran en pricing público viejo
      esPopular: plan.esPopular,
      ordenamiento: plan.ordenamiento,
    }

    if (existing) {
      await prisma.subscriptionPlan.update({
        where: { slug: plan.slug },
        data,
      })
      updated++
      console.log(`  🔄 ${plan.slug}: actualizado (ID: ${existing.id.slice(0, 8)})`)
    } else {
      const created_record = await prisma.subscriptionPlan.create({
        data: {
          ...data,
          slug: plan.slug,
        },
      })
      created++
      console.log(`  ✅ ${plan.slug}: creado (ID: ${created_record.id.slice(0, 8)})`)
    }
  }

  console.log(`\n=== Resumen ===`)
  console.log(`  Creados:  ${created}`)
  console.log(`  Actualizados: ${updated}`)
  console.log(`  Total:    ${SEED_PLANS.length}`)

  // Verificar
  console.log('\n=== Verificación ===')
  const verifyPlans = await prisma.subscriptionPlan.findMany({
    where: { slug: { in: ['scale', 'compliance'] } },
  })
  for (const p of verifyPlans) {
    const hasModules = Array.isArray((p.features as any)?.modules)
    const moduleCount = hasModules ? (p.features as any).modules.length : 0
    console.log(`  ${p.slug}: ID=${p.id.slice(0,8)} nombre=${p.nombre} módulos=${moduleCount}`)
    console.log(`    límites: users=${p.limiteUsuarios} leads=${p.limiteLeads} storage=${p.limiteStorage}`)
    console.log(`    flags: whitelabel=${p.whitelabelHabilitado} api=${p.apiAccessHabilitado}`)
  }

  await prisma.$disconnect()
  console.log('\n✅ Seed completado.')
}

main().catch((e) => {
  console.error('Error fatal:', e)
  prisma.$disconnect()
  process.exit(1)
})
