export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { processExpiredTrials, sendTrialReminders } from '@/lib/trial-service';

/**
 * GET /api/cron/trials
 * Procesa trials expirados y envía recordatorios.
 * Debe ejecutarse diariamente.
 * Protegido por CRON_SECRET en producción.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (process.env.NODE_ENV === 'production' && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  try {
    const results = {
      timestamp: new Date().toISOString(),
      expired: { processed: 0, errors: [] as string[] },
      reminders: { sent: 0, errors: [] as string[] },
    };

    const expiredResult = await processExpiredTrials();
    results.expired.processed = expiredResult.processed;
    results.expired.errors = expiredResult.errors;

    const reminderResult = await sendTrialReminders();
    results.reminders.sent = reminderResult.sent;
    results.reminders.errors = reminderResult.errors;

    console.log('[Cron/Trials] Results:', results);

    return NextResponse.json({
      success: true,
      ...results
    });
  } catch (error: any) {
    console.error('[Cron/Trials] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}