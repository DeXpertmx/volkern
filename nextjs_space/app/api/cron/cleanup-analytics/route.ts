export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { cleanupOldEvents } from '@/lib/analytics/store';

/**
 * GET /api/cron/cleanup-analytics
 * Elimina eventos de analytics con más de 90 días de antigüedad.
 * Debe ejecutarse semanalmente.
 * Protegido por CRON_SECRET en producción.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (
    process.env.NODE_ENV === 'production' &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  try {
    const deleted = await cleanupOldEvents(90);

    console.log(`[Cron/CleanupAnalytics] Deleted ${deleted} events older than 90 days`);

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      deleted,
    });
  } catch (error: any) {
    console.error('[Cron/CleanupAnalytics] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
