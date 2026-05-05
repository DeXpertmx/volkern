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
  | 'pages';

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
    },
    modules,
    stripePriceId: parsedFeatures?.stripePriceId || '',
    branding: {
      whitelabel: plan.whitelabelHabilitado,
      customDomain: plan.dominioPersonalizadoHabilitado
    }
  };
}

function getHardcodedPlanConfig(planSlug: string): PlanConfig {
  const key = planSlug.toUpperCase() as keyof typeof PLANS;
  const actualSlug = PLANS[key] || planSlug;
  
  const limits = PLAN_LIMITS[actualSlug as keyof typeof PLAN_LIMITS] || PLAN_LIMITS[PLANS.PRO];
  const modules = PLAN_MODULES[actualSlug] || PLAN_MODULES[PLANS.STARTER];
  const prices = PLAN_PRICES[actualSlug as keyof typeof PLAN_PRICES];

  return {
    id: actualSlug,
    slug: actualSlug,
    nombre: actualSlug,
    precio: prices?.monthly || 0,
    moneda: prices?.currency || 'eur',
    intervalo: prices ? 'mensual' : 'mensual',
    limites: limits,
    modules,
    stripePriceId: prices?.stripePriceId || ''
  };
}

export async function getTenantEffectiveLimits(tenantId: string): Promise<Record<string, number>> {
  const tenant = await globalPrisma.tenant.findUnique({
    where: { id: tenantId },
    select: { plan: true }
  });

  if (!tenant) {
    return PLAN_LIMITS[PLANS.STARTER];
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
      limits[plan.slug] = config.limites;
    }

    const hardcodedPlans = Object.keys(PLAN_LIMITS) as (keyof typeof PLAN_LIMITS)[];
    for (const planKey of hardcodedPlans) {
      if (!limits[planKey]) {
        limits[planKey] = PLAN_LIMITS[planKey];
      }
    }

    return limits;
  } catch (error) {
    console.error('[Subscription] Error fetching all plans:', error);
    return PLAN_LIMITS;
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
  
  const planOrder = ['basico', 'starter', 'growth', 'pro', 'profesional', 'pro-agency'];
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
  pages: 'Páginas'
};