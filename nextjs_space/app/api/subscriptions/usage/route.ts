export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { 
  getTenantEffectiveLimits, 
  getFeatureUsage, 
  getTenantPlan,
  getSuggestedUpgrade,
  FeatureName,
  FEATURE_LABELS
} from '@/lib/subscription';
import { withTenantAuth } from '@/lib/api-key-auth';

const TRACKED_FEATURES: FeatureName[] = [
  'leads',
  'users',
  'emails_per_month',
  'storage_gb',
  'pages',
  'automations_count',
  'whatsapp_messages',
  'sms_messages',
  'courses',
  'students',
  'catalogo_items',
  'published_pages',
  'invoices',
  'contratos_sign'
];

export const GET = withTenantAuth((async (request: NextRequest, auth: any) => {
  try {
    const tenantId = auth.tenant!.id;
    
    const [limits, plan, upgradeInfo] = await Promise.all([
      getTenantEffectiveLimits(tenantId),
      getTenantPlan(tenantId),
      getSuggestedUpgrade(tenantId)
    ]);

    const usagePromises = TRACKED_FEATURES.map(async (feature) => {
      const currentUsage = await getFeatureUsage(tenantId, feature);
      const limit = limits[feature];
      const percentage = limit === -1 ? 0 : Math.round((currentUsage / Math.max(limit, 1)) * 100);
      
      return {
        feature,
        label: FEATURE_LABELS[feature],
        current: currentUsage,
        limit,
        unlimited: limit === -1,
        percentage,
        status: limit === -1 ? 'ok' : percentage >= 100 ? 'exceeded' : percentage >= 80 ? 'warning' : 'ok'
      };
    });

    const usage = await Promise.all(usagePromises);

    return NextResponse.json({
      plan: {
        slug: plan?.slug || 'unknown',
        nombre: plan?.nombre || 'Plan Desconocido'
      },
      usage,
      upgrade: {
        suggestedPlan: upgradeInfo.suggestedPlan,
        nearLimitCount: upgradeInfo.nearLimitFeatures.length,
        message: upgradeInfo.message
      }
    });
  } catch (error) {
    console.error('[GET /api/subscriptions/usage] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}) as any, ['subscriptions:read']);

export const POST = withTenantAuth((async (request: NextRequest, auth: any) => {
  try {
    const tenantId = auth.tenant!.id;
    const { feature, increment = 1 } = await request.json();

    if (!feature) {
      return NextResponse.json(
        { error: 'Feature name is required' },
        { status: 400 }
      );
    }

    const validFeatures: FeatureName[] = TRACKED_FEATURES;

    if (!validFeatures.includes(feature)) {
      return NextResponse.json(
        { error: `Invalid feature: ${feature}` },
        { status: 400 }
      );
    }

    const { incrementUsage, getTenantEffectiveLimits } = await import('@/lib/subscription');
    
    await incrementUsage(tenantId, feature as FeatureName, increment);
    
    const limits = await getTenantEffectiveLimits(tenantId);
    const newUsage = limits[feature] !== undefined 
      ? (limits as any)[feature] 
      : 0;

    return NextResponse.json({
      feature,
      increment,
      currentUsage: newUsage
    });
  } catch (error) {
    console.error('[POST /api/subscriptions/usage] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}) as any, ['subscriptions:write']);