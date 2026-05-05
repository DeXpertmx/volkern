import { NextRequest, NextResponse } from 'next/server';
import { getSuggestedUpgrade, getTenantPlan, FEATURE_LABELS, FeatureName } from '@/lib/subscription';
import { withTenantAuth } from '@/lib/api-key-auth';

export const GET = withTenantAuth(async (request: NextRequest, auth) => {
  try {
    const tenantId = auth.tenant!.id;
    
    const [upgradeInfo, currentPlan] = await Promise.all([
      getSuggestedUpgrade(tenantId),
      getTenantPlan(tenantId)
    ]);

    const nearLimit = upgradeInfo.nearLimitFeatures.map(f => ({
      feature: f.feature,
      featureLabel: FEATURE_LABELS[f.feature as FeatureName] || f.feature,
      used: f.used,
      limit: f.limit,
      percentage: Math.round(f.percentage),
      severity: f.percentage >= 100 ? 'critical' : f.percentage >= 90 ? 'warning' : 'notice'
    }));

    const response = {
      currentPlan: currentPlan?.nombre || upgradeInfo.currentPlan,
      currentPlanSlug: currentPlan?.slug || upgradeInfo.currentPlan,
      nearLimitFeatures: nearLimit,
      suggestedUpgrade: upgradeInfo.suggestedPlan,
      message: upgradeInfo.message,
      showUpgradePrompt: nearLimit.length > 0 && nearLimit.some(f => f.percentage >= 80),
      pricing: currentPlan ? {
        precio: currentPlan.precio,
        moneda: currentPlan.moneda,
        intervalo: currentPlan.intervalo
      } : null
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('[GET /api/subscriptions/upgrade-prompt] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}, ['subscriptions:read']);