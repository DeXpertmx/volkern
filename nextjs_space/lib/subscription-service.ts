import { globalPrisma, getTenantDb } from './db';
import { 
  getTenantEffectiveLimits, 
  checkFeatureLimit as checkLimit, 
  incrementUsage as addUsage, 
  getFeatureUsage, 
  getTenantFeatures,
  getTenantPlan,
  FeatureName,
  FeatureLimit,
  PlanConfig
} from './subscription';

export class SubscriptionService {
  private tenantId: string;

  constructor(tenantId: string) {
    this.tenantId = tenantId;
  }

  async getPlan(): Promise<PlanConfig | null> {
    return getTenantPlan(this.tenantId);
  }

  async checkFeatureLimit(
    feature: FeatureName, 
    amount: number = 1
  ): Promise<FeatureLimit> {
    return checkLimit(this.tenantId, feature, amount);
  }

  async incrementUsage(
    feature: FeatureName, 
    amount: number = 1
  ): Promise<void> {
    return addUsage(this.tenantId, feature, amount);
  }

  async getUsage(feature: FeatureName): Promise<number> {
    return getFeatureUsage(this.tenantId, feature);
  }

  async getAllLimits(): Promise<Record<string, number>> {
    return getTenantEffectiveLimits(this.tenantId);
  }

  async getActiveFeatures(): Promise<{ module: string; enabled: boolean; customLimit?: number }[]> {
    return getTenantFeatures(this.tenantId);
  }
}

export { FeatureName, FeatureLimit, PlanConfig };