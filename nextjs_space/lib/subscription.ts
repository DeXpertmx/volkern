import { globalPrisma, getTenantDb } from './db';
import { PLAN_LIMITS, PLAN_MODULES, PLAN_PRICES, PLANS, CrmModule } from './plans';

export type FeatureName = 
  | 'leads' 
  | 'users'
  | 'contacts'
  | 'emails_per_month' 
  | 'automation_runs'
  | 'whatsapp_messages'
  | 'sms_messages'
  | 'courses'
  | 'students'
  | 'storage_gb'
  | 'ai_image_generations'
  | 'business_emails'
  | 'business_domains'
  | 'business_email_gb'
  | 'automations_count'
  | 'pages'
  | 'catalogo_items'
  | 'published_pages'
  | 'invoices'
  | 'contratos_sign';

export interface FeatureLimit {
  current: number;
  limit: number;
  allowed: boolean;
}

export interface PlanConfig {
  id: string;
  slug: string;
  nombre: string;
  precio: number;
  moneda: string;
  intervalo: string;
  limites: Record<string, number>;
  modules: CrmModule[];
  stripePriceId?: string;
  stripePriceYearlyId?: string;
  branding?: {
    whitelabel: boolean;
    customDomain: boolean;
  };
}

interface DbSubscriptionPlan {
  id: string;
  nombre: string;
  descripcion: string | null;
  slug: string;
  precio: number;
  moneda: string;
  intervalo: string;
  precioSetup: number | null;
  limiteUsuarios: number;
  limiteLeads: number;
  limiteCursos: number;
  limiteEstudiantes: number;
  limiteStorage: number;
  whatsappHabilitado: boolean;
  emailHabilitado: boolean;
  smsHabilitado: boolean;
  telegramHabilitado: boolean;
  facebookHabilitado: boolean;
  instagramHabilitado: boolean;
  lmsHabilitado: boolean;
  automationsHabilitado: boolean;
  campaignsHabilitado: boolean;
  whitelabelHabilitado: boolean;
  dominioPersonalizadoHabilitado: boolean;
  apiAccessHabilitado: boolean;
  features: any;
  activo: boolean;
  esPublico: boolean;
  esPopular: boolean;
  ordenamiento: number;
}

interface DbTenantFeature {
  feature: string;
  habilitado: boolean;
  limitePersonalizado: number | null;
  configuracion: any;
}

export async function getTenantPlan(tenantId: string): Promise<PlanConfig | null> {
  const tenant = await globalPrisma.tenant.findUnique({
    where: { id: tenantId },
    select: { plan: true }
  });

  if (!tenant) return null;

  return getPlanConfig(tenant.plan);
}

export async function getPlanConfig(planSlug: string): Promise<PlanConfig> {
  const normalizedSlug = planSlug.toLowerCase();
  
  try {
    const dbPlan = await globalPrisma.subscriptionPlan.findUnique({
      where: { slug: normalizedSlug }
    });

    if (dbPlan) {
      return mapDbPlanToConfig(dbPlan);
    }
  } catch (error) {
    console.error('[Subscription] Error fetching plan from DB:', error);
  }

  return getHardcodedPlanConfig(normalizedSlug);
}

function mapDbPlanToConfig(plan: DbSubscriptionPlan): PlanConfig {
  const features = plan.features || {};
  const parsedFeatures = typeof features === 'string' ? JSON.parse(features) : features;
  
  const modules: CrmModule[] = [];
  if (parsedFeatures?.modules) {
    modules.push(...parsedFeatures.modules);
  }
  
  const hardcodedModules = PLAN_MODULES[plan.slug as keyof typeof PLAN_MODULES] || [];
  for (const mod of hardcodedModules) {
    if (!modules.includes(mod)) {
      modules.push(mod);
    }
  }

  const limiteLeads = plan.limiteLeads ?? -1;
  const limiteUsuarios = plan.limiteUsuarios ?? 5;
  const limiteStorage = plan.limiteStorage ?? 10;
  const limiteCursos = plan.limiteCursos ?? 0;
  const limiteEstudiantes = plan.limiteEstudiantes ?? 0;

  return {
    id: plan.id,
    slug: plan.slug,
    nombre: plan.nombre,
    precio: plan.precio,
    moneda: plan.moneda,
    intervalo: plan.intervalo,
    limites: {
      leads: limiteLeads,
      users: limiteUsuarios,
      storage_gb: limiteStorage,
      courses: limiteCursos,
      students: limiteEstudiantes,
      emails_per_month: parsedFeatures?.emails_per_month ?? (plan.emailHabilitado ? 1000 : 0),
      automation_runs: parsedFeatures?.automation_runs ?? (plan.automationsHabilitado ? -1 : 0),
      whatsapp_messages: parsedFeatures?.whatsapp_messages ?? (plan.whatsappHabilitado ? -1 : 0),
      sms_messages: parsedFeatures?.sms_messages ?? (plan.smsHabilitado ? -1 : 0),
      ai_image_generations: parsedFeatures?.ai_image_generations ?? 0,
      business_emails: parsedFeatures?.business_emails ?? 0,
      business_domains: parsedFeatures?.business_domains ?? 0,
      business_email_gb: parsedFeatures?.business_email_gb ?? 0,
      automations_count: parsedFeatures?.automations_count ?? (plan.automationsHabilitado ? -1 : 0),
      pages: parsedFeatures?.pages ?? 10,
      ...parsedFeatures?.raw_limits
    } as any,
    modules,
    stripePriceId: parsedFeatures?.stripePriceId || '',
    stripePriceYearlyId: parsedFeatures?.stripePriceYearlyId || '',
    branding: {
      whitelabel: plan.whitelabelHabilitado,
      customDomain: plan.dominioPersonalizadoHabilitado
    }
  } as any;
}

function getHardcodedPlanConfig(planSlug: string): PlanConfig {
  const normalizedSlug = planSlug.toLowerCase();
  const limits = PLAN_LIMITS[normalizedSlug as keyof typeof PLAN_LIMITS] || PLAN_LIMITS[PLANS.ESENCIAL];
  const modules = PLAN_MODULES[normalizedSlug] || PLAN_MODULES[PLANS.ESENCIAL];
  const prices = (PLAN_PRICES as any)[normalizedSlug];

  return {
    id: normalizedSlug,
    slug: normalizedSlug,
    nombre: normalizedSlug === 'esencial' ? 'Esencial' : normalizedSlug === 'profesional' ? 'Profesional' : normalizedSlug === 'infinity' ? 'Infinity' : normalizedSlug === 'scale' ? 'Scale' : normalizedSlug === 'compliance' ? 'Compliance Pro' : normalizedSlug,
    precio: prices?.monthly || 0,
    moneda: prices?.currency || 'eur',
    intervalo: prices ? 'mensual' : 'mensual',
    limites: limits,
    modules,
    stripePriceId: prices?.stripePriceId || '',
    stripePriceYearlyId: prices?.stripePriceYearlyId || '',
  } as any;
}

export async function getTenantEffectiveLimits(tenantId: string): Promise<Record<string, number>> {
  const tenant = await globalPrisma.tenant.findUnique({
    where: { id: tenantId },
    select: { plan: true }
  });

  if (!tenant) {
    return PLAN_LIMITS[PLANS.ESENCIAL] as any;
  }

  const planConfig = await getPlanConfig(tenant.plan);
  const baseLimits = { ...planConfig.limites };

  const tenantFeatures = await globalPrisma.tenantFeature.findMany({
    where: { tenantId }
  });

  for (const feature of tenantFeatures) {
    if (feature.limitePersonalizado !== null) {
      baseLimits[feature.feature] = feature.limitePersonalizado;
    }
  }

  return baseLimits;
}

export async function checkFeatureLimit(
  tenantId: string,
  featureName: FeatureName,
  amount: number = 1
): Promise<FeatureLimit> {
  const limits = await getTenantEffectiveLimits(tenantId);
  const limit = limits[featureName];

  if (limit === undefined || limit === -1) {
    return { current: 0, limit: -1, allowed: true };
  }

  const usage = await getFeatureUsage(tenantId, featureName);
  const allowed = usage + amount <= limit;

  return {
    current: usage,
    limit,
    allowed
  };
}

export async function incrementUsage(
  tenantId: string,
  featureName: FeatureName,
  amount: number = 1
): Promise<void> {
  const usageKey = `usage_${featureName}`;
  const today = new Date().toISOString().split('T')[0];
  const key = `${usageKey}_${today}`;

  const existing = await globalPrisma.tenant.findUnique({
    where: { id: tenantId },
    select: { limites: true }
  });

  const currentLimits = (existing?.limites as Record<string, any>) || {};
  const currentUsage = currentLimits[key] || 0;

  await globalPrisma.tenant.update({
    where: { id: tenantId },
    data: {
      limites: {
        ...currentLimits,
        [key]: currentUsage + amount
      }
    }
  });
}

export async function getFeatureUsage(tenantId: string, featureName: FeatureName): Promise<number> {
  const usageKey = `usage_${featureName}`;
  const today = new Date().toISOString().split('T')[0];
  const key = `${usageKey}_${today}`;

  const tenant = await globalPrisma.tenant.findUnique({
    where: { id: tenantId },
    select: { limites: true }
  });

  const currentLimits = (tenant?.limites as Record<string, any>) || {};
  const usage = currentLimits[key] || 0;

  switch (featureName) {
    case 'leads':
      const tenantDb = await getTenantDb(tenantId);
      const dbUsage = await tenantDb.client.lead.count({ where: { tenantId } });
      return dbUsage;
    case 'contacts': {
      const contactDb = await getTenantDb(tenantId);
      return await contactDb.client.contact.count({ where: { tenantId } });
    }
    case 'users':
      return await globalPrisma.user.count({ where: { tenantId } });
    case 'emails_per_month': {
      const now = new Date();
      const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const tenantDb = await getTenantDb(tenantId);
      const emailUsage = await tenantDb.client.campaignRecipient.count({
        where: {
          tenantId,
          fechaEnviado: { gte: firstDayOfMonth }
        }
      });
      return emailUsage;
    }
    case 'storage_gb': {
      const tenantDb = await getTenantDb(tenantId);
      const storageBytes = await tenantDb.client.dealAttachment.aggregate({
        where: { tenantId },
        _sum: { tamano: true }
      });
      return Math.ceil((storageBytes._sum?.tamano || 0) / (1024 * 1024 * 1024));
    }
    case 'pages': {
      const tenantDb = await getTenantDb(tenantId);
      return await tenantDb.client.page.count({ where: { tenantId } });
    }
    case 'automations_count': {
      const tenantDb = await getTenantDb(tenantId);
      return await tenantDb.client.automation.count({ where: { tenantId } });
    }
    case 'catalogo_items': {
      const catDb = await getTenantDb(tenantId);
      return await catDb.client.catalogoItem.count({ where: { tenantId } });
    }
    case 'published_pages': {
      const pageDb = await getTenantDb(tenantId);
      return await pageDb.client.page.count({
        where: { tenantId, estado: 'publicado' }
      });
    }
    case 'invoices': {
      const invDb = await getTenantDb(tenantId);
      return await invDb.client.invoice.count({ where: { tenantId } });
    }
    case 'contratos_sign': {
      const contDb = await getTenantDb(tenantId);
      return await contDb.client.contrato.count({
        where: { tenantId, estado: { in: ['firmado', 'vigente'] } }
      });
    }
    default:
      return usage;
  }
}

export async function getTenantFeatures(
  tenantId: string
): Promise<{ module: CrmModule; enabled: boolean; customLimit?: number }[]> {
  const tenant = await globalPrisma.tenant.findUnique({
    where: { id: tenantId },
    select: { plan: true }
  });

  if (!tenant) return [];

  const planConfig = await getPlanConfig(tenant.plan);
  const planModules = new Set(planConfig.modules);

  const tenantFeatures = await globalPrisma.tenantFeature.findMany({
    where: { tenantId, habilitado: true }
  });
  const enabledFeatures = new Set(tenantFeatures.map(f => f.feature));

  const result: { module: CrmModule; enabled: boolean; customLimit?: number }[] = [];

  for (const mod of planConfig.modules) {
    const isEnabled = planModules.has(mod) || enabledFeatures.has(mod);
    const customFeature = tenantFeatures.find(f => f.feature === mod);
    result.push({
      module: mod as CrmModule,
      enabled: isEnabled,
      customLimit: customFeature?.limitePersonalizado || undefined
    });
  }

  return result;
}

export async function isModuleEnabled(
  tenantId: string,
  moduleId: CrmModule
): Promise<boolean> {
  const features = await getTenantFeatures(tenantId);
  const feature = features.find(f => f.module === moduleId);
  return feature?.enabled || false;
}

export async function getActiveModules(tenantId: string): Promise<CrmModule[]> {
  const features = await getTenantFeatures(tenantId);
  return features.filter(f => f.enabled).map(f => f.module);
}

export async function getAllPlanLimits(): Promise<Record<string, Record<string, number>>> {
  try {
    const dbPlans = await globalPrisma.subscriptionPlan.findMany({
      where: { activo: true },
      orderBy: { ordenamiento: 'asc' }
    });

    const limits: Record<string, Record<string, number>> = {};
    for (const plan of dbPlans) {
      const config = mapDbPlanToConfig(plan);
      limits[plan.slug] = config.limites as any;
    }

    const hardcodedPlans = Object.keys(PLAN_LIMITS) as (keyof typeof PLAN_LIMITS)[];
    for (const planKey of hardcodedPlans) {
      if (!limits[planKey]) {
        limits[planKey] = PLAN_LIMITS[planKey] as any;
      }
    }

    return limits as any;
  } catch (error) {
    console.error('[Subscription] Error fetching all plans:', error);
    return PLAN_LIMITS as any;
  }
}

export async function getSuggestedUpgrade(tenantId: string): Promise<{
  currentPlan: string;
  nearLimitFeatures: { feature: string; used: number; limit: number; percentage: number }[];
  suggestedPlan: string | null;
  message: string;
}> {
  const tenant = await globalPrisma.tenant.findUnique({
    where: { id: tenantId },
    select: { plan: true }
  });

  if (!tenant) {
    return {
      currentPlan: 'unknown',
      nearLimitFeatures: [],
      suggestedPlan: null,
      message: 'Tenant no encontrado'
    };
  }

  const limits = await getTenantEffectiveLimits(tenantId);
  const nearLimitFeatures: { feature: string; used: number; limit: number; percentage: number }[] = [];

  const trackedFeatures: FeatureName[] = ['leads', 'users', 'emails_per_month', 'storage_gb', 'pages', 'automations_count'];

  for (const feature of trackedFeatures) {
    const limit = limits[feature];
    if (limit === undefined || limit === -1) continue;

    const usage = await getFeatureUsage(tenantId, feature);
    const percentage = (usage / limit) * 100;

    if (percentage >= 80) {
      nearLimitFeatures.push({
        feature,
        used: usage,
        limit,
        percentage
      });
    }
  }

  const allPlans = await getAllPlanLimits();
  const currentLimits = allPlans[tenant.plan] || {};
  
  let suggestedPlan: string | null = null;
  
  const planOrder = ['basico', 'esencial', 'profesional', 'infinity', 'pro-agency'];
  const currentPlanIndex = planOrder.indexOf(tenant.plan.toLowerCase());

  if (currentPlanIndex < planOrder.length - 1) {
    for (let i = currentPlanIndex + 1; i < planOrder.length; i++) {
      const nextPlan = planOrder[i];
      const nextLimits = allPlans[nextPlan];
      
      if (!nextLimits) continue;

      const upgrades = nearLimitFeatures.filter(f => {
        const currentLimit = currentLimits[f.feature] || 0;
        const nextLimit = nextLimits[f.feature] || 0;
        return nextLimit > currentLimit || nextLimit === -1;
      });

      if (upgrades.length > 0) {
        suggestedPlan = nextPlan;
        break;
      }
    }
  }

  let message = '';
  if (nearLimitFeatures.length === 0) {
    message = 'Estás dentro de tus límites';
  } else if (suggestedPlan) {
    message = `Has alcanzado el ${Math.max(...nearLimitFeatures.map(f => f.percentage)).toFixed(0)}% en ${nearLimitFeatures.length} feature(s). Considera actualizar a ${suggestedPlan}`;
  } else {
    message = `Has alcanzado el ${Math.max(...nearLimitFeatures.map(f => f.percentage)).toFixed(0)}% en ${nearLimitFeatures.length} feature(s). Contáctanos para discutir opciones`;
  }

  return {
    currentPlan: tenant.plan,
    nearLimitFeatures: nearLimitFeatures.sort((a, b) => b.percentage - a.percentage),
    suggestedPlan,
    message
  };
}

/**
 * Features tracked for limit alerts (80% threshold)
 */
const ALERT_THRESHOLD = 80 // percentage

const ALERT_FEATURES: FeatureName[] = [
  'leads',
  'users',
  'emails_per_month',
  'storage_gb',
  'pages',
  'published_pages',
  'automations_count',
  'catalogo_items',
  'invoices',
  'contratos_sign',
  'whatsapp_messages',
  'courses',
  'students',
]

/**
 * Checks all tenants for features near their limit (>=80%)
 * and sends email notifications to tenant admins.
 * Runs via cron job. Tracks last notification to avoid spamming.
 */
export async function checkAndNotifyLimitAlerts(): Promise<{
  checked: number
  notified: number
  alerts: { tenantId: string; tenantName: string; features: string[] }[]
  errors: string[]
}> {
  const result = {
    checked: 0,
    notified: 0,
    alerts: [] as { tenantId: string; tenantName: string; features: string[] }[],
    errors: [] as string[],
  }

  try {
    const tenants = await globalPrisma.tenant.findMany({
      where: { estado: { in: ['trial', 'activo'] } },
      select: { id: true, nombre: true, slug: true, billingEmail: true, limites: true },
    })

    for (const tenant of tenants) {
      try {
        result.checked++
        const limits = await getTenantEffectiveLimits(tenant.id)
        const nearLimitFeatures: { feature: string; label: string; used: number; limit: number; percentage: number }[] = []

        for (const feature of ALERT_FEATURES) {
          const limit = limits[feature]
          if (limit === undefined || limit === -1) continue

          const usage = await getFeatureUsage(tenant.id, feature)
          const percentage = Math.round((usage / Math.max(limit, 1)) * 100)

          if (percentage >= ALERT_THRESHOLD) {
            nearLimitFeatures.push({
              feature,
              label: FEATURE_LABELS[feature as FeatureName] || feature,
              used: usage,
              limit,
              percentage,
            })
          }
        }

        if (nearLimitFeatures.length === 0) continue

        // Check last notification time to avoid spamming (max once per 24h)
        const currentLimits = (tenant.limites as Record<string, any>) || {}
        const lastNotified = currentLimits?.lastLimitAlertAt
        if (lastNotified) {
          const hoursSinceLast = (Date.now() - new Date(lastNotified).getTime()) / (1000 * 60 * 60)
          if (hoursSinceLast < 24) continue
        }

        // Find admin users to notify
        const admins = await globalPrisma.user.findMany({
          where: { tenantId: tenant.id, role: { nombre: { in: ['Superadmin', 'Admin'] } } },
          select: { id: true, email: true, name: true },
        })

        const recipients = [
          ...(tenant.billingEmail ? [{ email: tenant.billingEmail, name: tenant.nombre }] : []),
          ...admins.map(a => ({ email: a.email, name: a.name || 'Admin' })),
        ]

        // Deduplicate by email
        const seen = new Set<string>()
        const uniqueRecipients = recipients.filter(r => {
          if (seen.has(r.email)) return false
          seen.add(r.email)
          return true
        })

        if (uniqueRecipients.length === 0) continue

        // Build email content
        const featuresList = nearLimitFeatures.map(f =>
          `<tr>
            <td style="padding:10px;border-bottom:1px solid #e2e8f0;font-weight:600">${f.label}</td>
            <td style="padding:10px;border-bottom:1px solid #e2e8f0;text-align:center">${f.used.toLocaleString()}</td>
            <td style="padding:10px;border-bottom:1px solid #e2e8f0;text-align:center">${f.limit.toLocaleString()}</td>
            <td style="padding:10px;border-bottom:1px solid #e2e8f0;text-align:center">
              <span style="background:${f.percentage >= 100 ? '#ef4444' : '#f59e0b'};color:white;padding:2px 8px;border-radius:999px;font-size:12px;font-weight:600">
                ${f.percentage}%
              </span>
            </td>
          </tr>`
        ).join('')

        const maxPercentage = Math.max(...nearLimitFeatures.map(f => f.percentage))
        const isCritical = maxPercentage >= 100

        const html = `
          <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto">
            <div style="background:${isCritical ? '#ef4444' : '#f59e0b'};padding:24px;border-radius:12px 12px 0 0;text-align:center">
              <h1 style="color:white;margin:0;font-size:22px">
                ${isCritical ? '⚠️ Límite Alcanzado' : '📊 Límite Casi Alcanzado'}
              </h1>
              <p style="color:rgba(255,255,255,0.9);margin:8px 0 0 0;font-size:14px">
                ${tenant.nombre}
              </p>
            </div>
            <div style="padding:24px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:0 0 12px 12px">
              <p style="margin:0 0 16px 0;color:#475569;font-size:14px;line-height:1.6">
                ${isCritical
                  ? 'Tu cuenta ha alcanzado el límite en algunos recursos. Para evitar interrupciones, considera hacer upgrade a un plan superior.'
                  : 'Tu cuenta está cerca del límite en algunos recursos. Te recomendamos hacer upgrade para seguir creciendo sin interrupciones.'
                }
              </p>
              <table style="width:100%;border-collapse:collapse;background:white;border-radius:8px;overflow:hidden">
                <thead>
                  <tr style="background:#1e293b;color:white">
                    <th style="padding:10px;text-align:left;font-size:13px">Recurso</th>
                    <th style="padding:10px;text-align:center;font-size:13px">Usado</th>
                    <th style="padding:10px;text-align:center;font-size:13px">Límite</th>
                    <th style="padding:10px;text-align:center;font-size:13px">Uso</th>
                  </tr>
                </thead>
                <tbody>${featuresList}</tbody>
              </table>
              <div style="margin-top:24px;text-align:center">
                <a href="${process.env.NEXTAUTH_URL || 'https://volkern.app'}/dashboard/configuracion/billing"
                   style="display:inline-block;background:#3b82f6;color:white;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px">
                  Ver mis límites
                </a>
              </div>
            </div>
          </div>`

        // Build push notification title/body
        const pushTitle = isCritical
          ? `⚠️ Límite alcanzado en ${tenant.nombre}`
          : `📊 ${tenant.nombre} — límite casi alcanzado`
        const topFeatures = nearLimitFeatures.slice(0, 3)
        const pushBody = topFeatures.map(f => `${f.label}: ${f.percentage}%`).join(' · ')
        const extraCount = nearLimitFeatures.length - 3
        const fullBody = extraCount > 0 ? `${pushBody} y ${extraCount} más` : pushBody

        // Send push notifications to admin users (in-app + external)
        const { sendPushNotification } = await import('@/lib/services/push-notification')
        const pushPromises = admins.map(a =>
          sendPushNotification(a.id, {
            title: pushTitle,
            body: fullBody,
            url: '/dashboard/configuracion/billing',
            tag: 'limit_alert',
            priority: isCritical ? 'high' : 'normal',
            data: {
              features: nearLimitFeatures.map(f => ({
                label: f.label,
                used: f.used,
                limit: f.limit,
                percentage: f.percentage,
              })),
            },
          })
        )

        // Send email to all unique recipients
        const { sendEmail } = await import('./resend-email')
        const subject = isCritical
          ? `⚠️ Límite alcanzado en ${tenant.nombre} — actúa ahora`
          : `📊 ${tenant.nombre} — ${nearLimitFeatures.length} recurso(s) al ${maxPercentage}% de capacidad`

        await Promise.allSettled([
          ...pushPromises,
          ...uniqueRecipients.map(r =>
            sendEmail({
              to: r.email,
              subject,
              html,
              tenantSubdomain: tenant.slug,
              tenantName: tenant.nombre,
            })
          ),
        ])

        // Update last notification timestamp
        await globalPrisma.tenant.update({
          where: { id: tenant.id },
          data: {
            limites: {
              ...currentLimits,
              lastLimitAlertAt: new Date().toISOString(),
            },
          },
        })

        result.notified += uniqueRecipients.length
        result.alerts.push({
          tenantId: tenant.id,
          tenantName: tenant.nombre,
          features: nearLimitFeatures.map(f => `${f.label} (${f.percentage}%)`),
        })
      } catch (err: any) {
        result.errors.push(`Tenant ${tenant.id}: ${err.message}`)
      }
    }
  } catch (err: any) {
    result.errors.push(`Fatal: ${err.message}`)
  }

  return result
}

export const FEATURE_LABELS: Record<FeatureName, string> = {
  leads: 'Leads',
  users: 'Usuarios',
  contacts: 'Contactos',
  emails_per_month: 'Emails al mes',
  automation_runs: 'Ejecuciones de automatización',
  whatsapp_messages: 'Mensajes WhatsApp',
  sms_messages: 'Mensajes SMS',
  courses: 'Cursos',
  students: 'Estudiantes',
  storage_gb: 'Almacenamiento (GB)',
  ai_image_generations: 'Generaciones de imagen IA',
  business_emails: 'Emails de negocio',
  business_domains: 'Dominios de negocio',
  business_email_gb: 'Almacenamiento email (GB)',
  automations_count: 'Automatizaciones',
  pages: 'Páginas',
  catalogo_items: 'Productos/Servicios',
  published_pages: 'Landing pages publicadas',
  invoices: 'Facturas emitidas',
  contratos_sign: 'Contratos firmados'
};