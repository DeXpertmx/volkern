import { globalPrisma } from './db';
import { TrialService } from './trial-service';
import { PLANS } from './plans';

export async function startTrialForNewTenant(tenantId: string, billingEmail?: string): Promise<void> {
  const service = new TrialService(tenantId);
  
  const { sendTrialWelcomeEmail } = await import('./email-templates');
  
  await service.startTrial(14);
  
  const status = await service.checkTrialStatus();
  
  if (billingEmail && status.startedAt) {
    try {
      const tenant = await globalPrisma.tenant.findUnique({
        where: { id: tenantId },
        select: { nombre: true },
      });
      
      if (tenant) {
        await sendTrialWelcomeEmail(
          billingEmail,
          tenant.nombre,
          14,
          status.expiredAt?.toISOString() || ''
        );
      }
    } catch (error) {
      console.error('[TrialOnboarding] Error sending welcome email:', error);
    }
  }
}

export async function trackFirstAction(tenantId: string, action: string): Promise<void> {
  const service = new TrialService(tenantId);
  const hasFirstAction = await service.hasDoneFirstAction();
  
  if (!hasFirstAction) {
    await service.markActivationEvent();
    
    console.log(`[TrialOnboarding] First action tracked for tenant ${tenantId}: ${action}`);
  }
}

export async function checkAndExpireTrial(tenantId: string): Promise<boolean> {
  const service = new TrialService(tenantId);
  const status = await service.checkTrialStatus();
  
  if (status.status === 'expired' && status.isTrial) {
    await service.expireTrial();
    return true;
  }
  
  return false;
}

export async function convertTrialToPaid(
  tenantId: string,
  plan: string = PLANS.PROFESIONAL,
  stripeCustomerId?: string,
  stripeSubscriptionId?: string
): Promise<void> {
  const service = new TrialService(tenantId);
  
  await globalPrisma.tenant.update({
    where: { id: tenantId },
    data: {
      stripeCustomerId: stripeCustomerId || undefined,
    },
  });
  
  await service.convertToPaid(plan);
  
  console.log(`[TrialOnboarding] Trial converted for tenant ${tenantId} to plan ${plan}`);
}

export const TRIAL_FIRST_ACTIONS = [
  'first_lead_created',
  'first_contact_created',
  'first_deal_created',
  'first_campaign_sent',
  'first_automation_created',
  'first_page_created',
  'first_integration_connected',
  'first_user_invited',
  'first_cita_scheduled',
  'first_cotizacion_created',
  'onboarding_completed',
];

export function isTrialFirstAction(action: string): boolean {
  return TRIAL_FIRST_ACTIONS.includes(action);
}