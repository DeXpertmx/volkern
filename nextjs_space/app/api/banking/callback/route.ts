import { NextRequest, NextResponse } from 'next/server';
import { StripeBankingService } from '@/lib/banking/stripe-banking-service';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const sessionId = searchParams.get('financial_connections_session_id');
  const tenantId = searchParams.get('tenantId');

  if (!sessionId || !tenantId) {
    return NextResponse.json({ error: 'Faltan parámetros' }, { status: 400 });
  }

  try {
    await StripeBankingService.handleSessionCallback(tenantId, sessionId);
    
    // Redirigir al dashboard
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    return NextResponse.redirect(`${baseUrl}/dashboard/finanzas/contabilidad?status=success`);
  } catch (error: any) {
    console.error('[BankCallback] Error:', error);
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    return NextResponse.redirect(`${baseUrl}/dashboard/finanzas/contabilidad?status=error&message=${encodeURIComponent(error.message)}`);
  }
}
