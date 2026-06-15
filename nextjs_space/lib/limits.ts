import { globalPrisma, getTenantDb } from './db';
import { PLAN_LIMITS, PlanType } from './plans';

export interface LimitCheckResult {
  allowed: boolean;
  limitType: string;
  current: number;
  max: number;
  message?: string;
}

/**
 * Verifica si un tenant puede crear un nuevo recurso basado en sus límites
 */
export async function checkResourceLimit(
  tenantId: string,
  resourceType: 'leads' | 'users' | 'emails_per_month' | 'automations' | 'storage_gb' | 'pages'
): Promise<LimitCheckResult> {
  // 1. Obtener información de plan del Control Plane (Global DB)
  const tenant = await globalPrisma.tenant.findUnique({
    where: { id: tenantId },
    select: { plan: true, limites: true }
  });

  if (!tenant) {
    return {
      allowed: false,
      limitType: resourceType,
      current: 0,
      max: 0,
      message: 'Tenant no encontrado'
    };
  }

  const planLimits = PLAN_LIMITS[tenant.plan as PlanType] || PLAN_LIMITS['esencial'];
  
  if (!PLAN_LIMITS[tenant.plan as PlanType]) {
    console.warn(`[Limits] Plan "${tenant.plan}" no encontrado en PLAN_LIMITS, usando fallback "esencial"`);
  }

  // Map automations to automation_runs in plan limits
  const limitKey = resourceType === 'automations' ? 'automation_runs' : resourceType;
  const maxAllowed = (planLimits as any)[limitKey];

  // -1 significa ilimitado
  if (maxAllowed === -1) {
    return {
      allowed: true,
      limitType: resourceType,
      current: 0,
      max: -1
    };
  }

  // 2. Obtener cliente de Base de Datos para el Tenant
  const tenantDb = await getTenantDb(tenantId);

  // 3. Obtener uso actual según el tipo de recurso (Tenant DB)
  let currentUsage = 0;
  const now = new Date();
  const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  switch (resourceType) {
    case 'leads':
      currentUsage = await tenantDb.client.lead.count({ where: { tenantId } });
      break;
    case 'users':
      // Los usuarios son globales (Control Plane)
      currentUsage = await globalPrisma.user.count({ where: { tenantId } });
      break;
    case 'emails_per_month':
      currentUsage = await tenantDb.client.campaignRecipient.count({
        where: {
          tenantId,
          fechaEnviado: { gte: firstDayOfMonth }
        }
      });
      break;
    case 'automations':
      currentUsage = await tenantDb.client.automation.count({ where: { tenantId } });
      break;
    case 'storage_gb':
      const storageBytes = await tenantDb.client.dealAttachment.aggregate({
        where: { tenantId },
        _sum: { tamano: true }
      });
      currentUsage = Math.ceil((storageBytes._sum?.tamano || 0) / (1024 * 1024 * 1024));
      break;
    case 'pages':
      currentUsage = await tenantDb.client.page.count({ where: { tenantId } });
      break;
  }

  const allowed = currentUsage < maxAllowed;

  return {
    allowed,
    limitType: resourceType,
    current: currentUsage,
    max: maxAllowed,
    message: allowed
      ? undefined
      : `Has alcanzado el límite de ${maxAllowed} ${getLimitLabel(resourceType)} para tu plan ${tenant.plan}`
  };
}

/**
 * Obtiene el uso actual de todos los recursos de un tenant
 */
export async function getTenantUsage(tenantId: string) {
  // 1. Obtener plan desde Global DB
  const tenant = await globalPrisma.tenant.findUnique({
    where: { id: tenantId },
    select: { plan: true }
  });

  if (!tenant) {
    throw new Error('Tenant no encontrado');
  }

  const planLimits = PLAN_LIMITS[tenant.plan as PlanType] || PLAN_LIMITS['esencial'];
  const now = new Date();
  const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  // 2. Obtener cliente Tenant DB
  const tenantDb = await getTenantDb(tenantId);

  // 3. Consultar uso en Tenant DB
  const [leadsCount, usersCount, emailsCount, automationsCount, pagesCount, storageBytes] = await Promise.all([
    tenantDb.client.lead.count({ where: { tenantId } }),
    globalPrisma.user.count({ where: { tenantId } }),
    tenantDb.client.campaignRecipient.count({
      where: {
        tenantId,
        fechaEnviado: { gte: firstDayOfMonth }
      }
    }),
    tenantDb.client.automation.count({ where: { tenantId } }),
    tenantDb.client.page.count({ where: { tenantId } }),
    tenantDb.client.dealAttachment.aggregate({
      where: { tenantId },
      _sum: { tamano: true }
    })
  ]);

  const storageGb = Math.ceil((storageBytes._sum?.tamano || 0) / (1024 * 1024 * 1024));

  return {
    leads: { current: leadsCount, max: planLimits.leads },
    users: { current: usersCount, max: planLimits.users },
    emails_per_month: { current: emailsCount, max: planLimits.emails_per_month },
    automations: { current: automationsCount, max: (planLimits as any).automation_runs },
    storage_gb: { current: storageGb, max: planLimits.storage_gb },
    pages: { current: pagesCount, max: (planLimits as any).pages || 0 }
  };
}

/**
 * Middleware helper para validar límites en rutas API
 */
export async function validateLimit(
  tenantId: string,
  resourceType: 'leads' | 'users' | 'emails_per_month' | 'automations' | 'storage_gb' | 'pages'
): Promise<{ allowed: boolean; error?: any }> {
  const check = await checkResourceLimit(tenantId, resourceType);

  if (!check.allowed) {
    return {
      allowed: false,
      error: {
        status: 403,
        message: check.message,
        code: 'LIMIT_REACHED',
        details: {
          current: check.current,
          max: check.max,
          limitType: check.limitType
        }
      }
    };
  }

  return { allowed: true };
}

function getLimitLabel(resourceType: string): string {
  const labels: Record<string, string> = {
    leads: 'leads',
    users: 'usuarios',
    emails_per_month: 'emails al mes',
    automations: 'automatizaciones',
    storage_gb: 'GB de almacenamiento',
    pages: 'páginas'
  };
  return labels[resourceType] || resourceType;
}

export { globalPrisma as prisma };
