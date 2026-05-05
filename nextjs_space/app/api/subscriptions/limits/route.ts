import { NextRequest, NextResponse } from 'next/server';
import { 
  getTenantEffectiveLimits, 
  checkFeatureLimit, 
  FeatureName,
  FEATURE_LABELS 
} from '@/lib/subscription';
import { withTenantAuth } from '@/lib/api-key-auth';

export const GET = withTenantAuth(async (request: NextRequest, auth) => {
  try {
    const tenantId = auth.tenant!.id;
    
    const limits = await getTenantEffectiveLimits(tenantId);
    
    const limitsArray = Object.entries(limits).map(([feature, limit]) => ({
      feature,
      label: FEATURE_LABELS[feature as FeatureName] || feature,
      limit,
      unlimited: limit === -1
    }));

    return NextResponse.json({ limits: limitsArray });
  } catch (error) {
    console.error('[GET /api/subscriptions/limits] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}, ['subscriptions:read']);

export const POST = withTenantAuth(async (request: NextRequest, auth) => {
  try {
    const { feature, amount = 1 } = await request.json();

    if (!feature) {
      return NextResponse.json(
        { error: 'Feature name is required' },
        { status: 400 }
      );
    }

    const validFeatures: FeatureName[] = [
      'leads', 'users', 'emails_per_month', 'automation_runs',
      'whatsapp_messages', 'sms_messages', 'courses', 'students',
      'storage_gb', 'ai_image_generations', 'business_emails',
      'business_domains', 'business_email_gb', 'automations_count', 'pages'
    ];

    if (!validFeatures.includes(feature)) {
      return NextResponse.json(
        { error: `Invalid feature: ${feature}` },
        { status: 400 }
      );
    }

    const result = await checkFeatureLimit(
      auth.tenant!.id,
      feature as FeatureName,
      amount
    );

    const response = {
      allowed: result.allowed,
      feature,
      label: FEATURE_LABELS[feature as FeatureName] || feature,
      usage: result.current,
      limit: result.limit,
      percentage: result.limit === -1 ? 0 : Math.round((result.current / result.limit) * 100)
    };

    if (!result.allowed) {
      return NextResponse.json(
        {
          ...response,
          error: `Has alcanzado el límite de ${result.limit} ${FEATURE_LABELS[feature as FeatureName] || feature}`,
          code: 'LIMIT_REACHED'
        },
        { status: 403 }
      );
    }

    return NextResponse.json(response);
  } catch (error) {
    console.error('[POST /api/subscriptions/limits] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}, ['subscriptions:read']);