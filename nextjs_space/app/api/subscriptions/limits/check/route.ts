export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { checkFeatureLimit, FeatureName, FEATURE_LABELS } from '@/lib/subscription';
import { withTenantAuth } from '@/lib/api-key-auth';

export const POST = withTenantAuth((async (request: NextRequest, auth: any) => {
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
      usage: result.current,
      limit: result.limit,
      feature,
      featureLabel: FEATURE_LABELS[feature as FeatureName] || feature,
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
    console.error('[POST /api/subscriptions/limits/check] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}) as any, ['subscriptions:read']);

export const GET = withTenantAuth((async (request: NextRequest, auth: any) => {
  try {
    const { searchParams } = new URL(request.url);
    const feature = searchParams.get('feature') as FeatureName;

    if (!feature) {
      return NextResponse.json(
        { error: 'Feature parameter is required' },
        { status: 400 }
      );
    }

    const result = await checkFeatureLimit(auth.tenant!.id, feature, 0);

    return NextResponse.json({
      allowed: result.allowed,
      usage: result.current,
      limit: result.limit,
      feature,
      featureLabel: FEATURE_LABELS[feature] || feature,
      percentage: result.limit === -1 ? 0 : Math.round((result.current / result.limit) * 100)
    });
  } catch (error) {
    console.error('[GET /api/subscriptions/limits/check] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}) as any, ['subscriptions:read']);