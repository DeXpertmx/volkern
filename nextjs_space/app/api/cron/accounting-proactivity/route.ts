import { NextRequest, NextResponse } from 'next/server';
import { AccountingProactivityWorker } from '@/lib/accounting/proactivity-worker';
import { NordigenService } from '@/lib/banking/nordigen-service';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (process.env.NODE_ENV === 'production' && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  try {
    // 1. Sync Bank Transactions (Nordigen)
    const bankSyncResult = await NordigenService.syncAllConnections();

    // 2. Scan for Suggestions & Alerts
    const reconResult = await AccountingProactivityWorker.scanForSuggestions();
    const taxResult = await AccountingProactivityWorker.scanForTaxAlerts();
    
    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      bankSync: bankSyncResult,
      reconciliationSuggestions: reconResult.suggestionsCount,
      taxAlerts: taxResult.alertsCount
    });
  } catch (error: any) {
    console.error('Error in Accounting Proactivity Cron:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
