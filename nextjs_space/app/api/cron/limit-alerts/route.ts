export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { checkAndNotifyLimitAlerts } from '@/lib/subscription';

/**
 * GET /api/cron/limit-alerts
 * Checks all tenants for features near their limits (>=80%)
 * and sends email notifications to tenant admins.
 * Should run daily.
 * Protected by CRON_SECRET in production.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (process.env.NODE_ENV === 'production' && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  try {
    const result = await checkAndNotifyLimitAlerts();

    console.log('[Cron/LimitAlerts] Results:', {
      checked: result.checked,
      notified: result.notified,
      alerts: result.alerts.length,
      errors: result.errors.length,
    });

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      ...result,
    });
  } catch (error: any) {
    console.error('[Cron/LimitAlerts] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
