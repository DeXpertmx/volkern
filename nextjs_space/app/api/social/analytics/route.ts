import { NextRequest, NextResponse } from 'next/server';
import { withTenantAuth } from '@/lib/api-key-auth';
import { socialAnalyticsService } from '@/lib/marketing/social-analytics-service';

export const dynamic = 'force-dynamic';

// GET /api/social/analytics — Obtener analíticas de todas las plataformas conectadas
export const GET = withTenantAuth(async (req, auth) => {
  try {
    const tenantId = auth.tenant!.id;
    const data = await socialAnalyticsService.getAnalytics(tenantId);
    return NextResponse.json({ success: true, ...data });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 },
    );
  }
});
