import { globalPrisma } from './db';
import { PLANS } from './plans';
import { sendTrialReminderEmail, sendTrialExpirationEmail } from './email-templates';

export type TrialStatus = 'active' | 'expired' | 'converted' | 'cancelled' | 'none';

export interface TrialInfo {
  status: TrialStatus;
  daysRemaining: number;
  expiredAt: Date | null;
  startedAt: Date | null;
  wasActivated: boolean;
  convertedAt: Date | null;
  isTrial: boolean;
}

export interface TrialLimits {
  leads: number;
  users: number;
  emails_per_month: number;
  storage_gb: number;
  pages: number;
  whatsapp_messages: number;
  automations_count: number;
}

const TRIAL_DEFAULT_DAYS = 14;

const TRIAL_LIMITS: TrialLimits = {
  leads: 100,
  users: 2,
  emails_per_month: 500,
  storage_gb: 1,
  pages: 3,
  whatsapp_messages: 100,
  automations_count: 0,
};

export class TrialService {
  private tenantId: string;

  constructor(tenantId: string) {
    this.tenantId = tenantId;
  }

  async startTrial(diasTrial: number = TRIAL_DEFAULT_DAYS): Promise<TrialInfo> {
    const now = new Date();
    const fechaTrialFin = new Date(now.getTime() + diasTrial * 24 * 60 * 60 * 1000);

    await globalPrisma.tenant.update({
      where: { id: this.tenantId },
      data: {
        plan: PLANS.TRIAL,
        fechaTrialInicio: now,
        fechaTrialFin: fechaTrialFin,
        estado: 'trial',
        limites: {
          ...TRIAL_LIMITS,
          _trialStarted: now.toISOString(),
          _trialActivated: false,
        },
      },
    });

    await this.trackActivationEvent('trial_started', {
      diasTrial,
      startedAt: now.toISOString(),
    });

    return this.checkTrialStatus();
  }

  async checkTrialStatus(): Promise<TrialInfo> {
    const tenant = await globalPrisma.tenant.findUnique({
      where: { id: this.tenantId },
      select: {
        plan: true,
        estado: true,
        fechaTrialInicio: true,
        fechaTrialFin: true,
        limites: true,
      },
    });

    if (!tenant) {
      return {
        status: 'none',
        daysRemaining: 0,
        expiredAt: null,
        startedAt: null,
        wasActivated: false,
        convertedAt: null,
        isTrial: false,
      };
    }

    const isTrialPlan = tenant.plan === PLANS.TRIAL;
    const limits = tenant.limites as Record<string, any> || {};
    const wasActivated = limits._trialActivated || false;
    const convertedAt = limits._trialConvertedAt ? new Date(limits._trialConvertedAt) : null;

    if (tenant.estado === 'cancelled') {
      return {
        status: 'cancelled',
        daysRemaining: 0,
        expiredAt: tenant.fechaTrialFin,
        startedAt: tenant.fechaTrialInicio,
        wasActivated,
        convertedAt,
        isTrial: isTrialPlan,
      };
    }

    if (convertedAt) {
      return {
        status: 'converted',
        daysRemaining: 0,
        expiredAt: tenant.fechaTrialFin,
        startedAt: tenant.fechaTrialInicio,
        wasActivated,
        convertedAt,
        isTrial: false,
      };
    }

    if (!tenant.fechaTrialFin) {
      return {
        status: 'none',
        daysRemaining: 0,
        expiredAt: null,
        startedAt: tenant.fechaTrialInicio,
        wasActivated,
        convertedAt: null,
        isTrial: isTrialPlan,
      };
    }

    const now = new Date();
    const expiredAt = new Date(tenant.fechaTrialFin);
    const isExpired = now > expiredAt;

    if (isExpired) {
      return {
        status: 'expired',
        daysRemaining: 0,
        expiredAt,
        startedAt: tenant.fechaTrialInicio,
        wasActivated,
        convertedAt: null,
        isTrial: true,
      };
    }

    const diff = expiredAt.getTime() - now.getTime();
    const daysRemaining = Math.ceil(diff / (1000 * 60 * 60 * 24));

    return {
      status: 'active',
      daysRemaining,
      expiredAt,
      startedAt: tenant.fechaTrialInicio,
      wasActivated,
      convertedAt: null,
      isTrial: true,
    };
  }

  async isTrialActive(): Promise<boolean> {
    const status = await this.checkTrialStatus();
    return status.status === 'active';
  }

  async convertToPaid(plan: string = PLANS.PROFESIONAL): Promise<TrialInfo> {
    const currentStatus = await this.checkTrialStatus();
    const now = new Date();

    const limits = (await globalPrisma.tenant.findUnique({
      where: { id: this.tenantId },
      select: { limites: true },
    }))?.limites as Record<string, any> || {};

    await globalPrisma.tenant.update({
      where: { id: this.tenantId },
      data: {
        plan,
        estado: 'activo',
        fechaTrialFin: null,
        limites: {
          ...limits,
          _trialConvertedAt: now.toISOString(),
          _trialActivated: true,
        },
      },
    });

    await this.trackActivationEvent('trial_converted', {
      convertedAt: now.toISOString(),
      previousPlan: PLANS.TRIAL,
      newPlan: plan,
    });

    return this.checkTrialStatus();
  }

  async expireTrial(): Promise<TrialInfo> {
    const now = new Date();

    await globalPrisma.tenant.update({
      where: { id: this.tenantId },
      data: {
        estado: 'expired',
      },
    });

    await this.trackActivationEvent('trial_expired', {
      expiredAt: now.toISOString(),
    });

    return this.checkTrialStatus();
  }

  async extendTrial(days: number): Promise<TrialInfo> {
    const currentStatus = await this.checkTrialStatus();
    
    if (!currentStatus.isTrial) {
      throw new Error('No hay un trial activo para extender');
    }

    const newEndDate = currentStatus.expiredAt 
      ? new Date(currentStatus.expiredAt.getTime() + days * 24 * 60 * 60 * 1000)
      : new Date(Date.now() + days * 24 * 60 * 60 * 1000);

    await globalPrisma.tenant.update({
      where: { id: this.tenantId },
      data: {
        fechaTrialFin: newEndDate,
      },
    });

    await this.trackActivationEvent('trial_extended', {
      extendedDays: days,
      newEndDate: newEndDate.toISOString(),
    });

    return this.checkTrialStatus();
  }

  async cancelTrial(): Promise<TrialInfo> {
    await globalPrisma.tenant.update({
      where: { id: this.tenantId },
      data: {
        estado: 'cancelled',
      },
    });

    await this.trackActivationEvent('trial_cancelled', {
      cancelledAt: new Date().toISOString(),
    });

    return this.checkTrialStatus();
  }

  async markActivationEvent(): Promise<void> {
    const tenant = await globalPrisma.tenant.findUnique({
      where: { id: this.tenantId },
      select: { limites: true },
    });

    const limits = (tenant?.limites as Record<string, any>) || {};

    await globalPrisma.tenant.update({
      where: { id: this.tenantId },
      data: {
        limites: {
          ...limits,
          _trialActivated: true,
          _firstActionAt: new Date().toISOString(),
        },
      },
    });
  }

  async hasDoneFirstAction(): Promise<boolean> {
    const tenant = await globalPrisma.tenant.findUnique({
      where: { id: this.tenantId },
      select: { limites: true },
    });

    const limits = (tenant?.limites as Record<string, any>) || {};
    return !!limits._trialActivated || !!limits._firstActionAt;
  }

  private async trackActivationEvent(event: string, metadata: Record<string, any>): Promise<void> {
    try {
      await globalPrisma.auditLog.create({
        data: {
          tenantId: this.tenantId,
          accion: event,
          entidad: 'Trial',
          entidadId: this.tenantId,
          descripcion: `Trial event: ${event}`,
          metadata,
        },
      });
    } catch (error) {
      console.error('[TrialService] Error tracking activation event:', error);
    }
  }

  async shouldShowUpgradePrompt(feature: string, currentUsage: number): Promise<{
    show: boolean;
    blocking: 'soft' | 'hard' | null;
    message: string;
    daysRemaining: number;
  }> {
    const status = await this.checkTrialStatus();
    const { checkFeatureLimit } = await import('./subscription');
    
    const limit = await checkFeatureLimit(this.tenantId, feature as any, 1);
    
    if (status.status !== 'active') {
      return {
        show: false,
        blocking: null,
        message: '',
        daysRemaining: 0,
      };
    }

    const featureLimits: Record<string, { soft: number; hard: number }> = {
      leads: { soft: 70, hard: 90 },
      users: { soft: 80, hard: 100 },
      emails_per_month: { soft: 70, hard: 90 },
      storage_gb: { soft: 70, hard: 90 },
      pages: { soft: 66, hard: 90 },
      whatsapp_messages: { soft: 70, hard: 90 },
    };

    const limits = featureLimits[feature];
    if (!limits) {
      return {
        show: false,
        blocking: null,
        message: '',
        daysRemaining: status.daysRemaining,
      };
    }

    const percentage = limit.limit > 0 ? (currentUsage / limit.limit) * 100 : 0;

    if (percentage >= limits.hard) {
      return {
        show: true,
        blocking: 'hard',
        message: `Has alcanzado el límite de ${feature}. Actualiza tu plan para continuar usando esta función.`,
        daysRemaining: status.daysRemaining,
      };
    }

    if (percentage >= limits.soft) {
      return {
        show: true,
        blocking: 'soft',
        message: `Estás usando el ${percentage.toFixed(0)}% de tu límite de ${feature}. Considera actualizar tu plan.`,
        daysRemaining: status.daysRemaining,
      };
    }

    return {
      show: false,
      blocking: null,
      message: '',
      daysRemaining: status.daysRemaining,
    };
  }
}

export async function getTenantTrialInfo(tenantId: string): Promise<TrialInfo> {
  const service = new TrialService(tenantId);
  return service.checkTrialStatus();
}

export async function startTenantTrial(tenantId: string, diasTrial: number = TRIAL_DEFAULT_DAYS): Promise<TrialInfo> {
  const service = new TrialService(tenantId);
  return service.startTrial(diasTrial);
}

/**
 * @deprecated since 2026-06-21 — el handler `app/api/cron/trials` que invocaba esta
 * función fue eliminado por dead-code cleanup. Ningún caller activo en el codebase.
 * Mantener como referencia hasta próxima limpieza mayor (puede ser eliminada sin
 * reemplazo; la lógica equivalente no se ha re-activado en otro lugar).
 */
export async function processExpiredTrials(): Promise<{ processed: number; errors: string[] }> {
  const errors: string[] = [];
  let processed = 0;

  try {
    const expiredTrials = await globalPrisma.tenant.findMany({
      where: {
        plan: PLANS.TRIAL,
        fechaTrialFin: { lt: new Date() },
        estado: 'trial',
      },
      select: { id: true, nombre: true, billingEmail: true },
    });

    for (const tenant of expiredTrials) {
      try {
        const service = new TrialService(tenant.id);
        await service.expireTrial();
        
        if (tenant.billingEmail) {
          await sendTrialExpirationEmail(tenant.billingEmail, tenant.nombre);
        }

        processed++;
      } catch (error) {
        errors.push(`Error processing trial ${tenant.id}: ${error}`);
      }
    }
  } catch (error) {
    errors.push(`Error fetching expired trials: ${error}`);
  }

  return { processed, errors };
}

/**
 * @deprecated since 2026-06-21 — el handler `app/api/cron/trials` que invocaba esta
 * función fue eliminado por dead-code cleanup. Ningún caller activo en el codebase.
 * Mantener como referencia hasta próxima limpieza mayor (puede ser eliminada sin
 * reemplazo; la lógica equivalente no se ha re-activado en otro lugar).
 */
export async function sendTrialReminders(): Promise<{ sent: number; errors: string[] }> {
  const errors: string[] = [];
  let sent = 0;

  try {
    const now = new Date();
    const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
    const oneDayFromNow = new Date(now.getTime() + 1 * 24 * 60 * 60 * 1000);

    const trialsToRemind = await globalPrisma.tenant.findMany({
      where: {
        plan: PLANS.TRIAL,
        estado: 'trial',
        fechaTrialFin: {
          gte: now,
          lte: threeDaysFromNow,
        },
      },
      select: { id: true, nombre: true, billingEmail: true, fechaTrialFin: true },
    });

    for (const tenant of trialsToRemind) {
      if (!tenant.billingEmail || !tenant.fechaTrialFin) continue;

      const daysUntilExpiry = Math.ceil(
        (new Date(tenant.fechaTrialFin).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      );

      if (daysUntilExpiry === 3 || daysUntilExpiry === 1) {
        try {
          await sendTrialReminderEmail(
            tenant.billingEmail,
            tenant.nombre,
            daysUntilExpiry
          );
          sent++;
        } catch (error) {
          errors.push(`Error sending reminder to ${tenant.id}: ${error}`);
        }
      }
    }
  } catch (error) {
    errors.push(`Error fetching trials for reminder: ${error}`);
  }

  return { sent, errors };
}