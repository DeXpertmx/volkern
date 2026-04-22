import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { StripeBankingService } from '@/lib/banking/stripe-banking-service';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { connectionId } = await req.json();

    if (!connectionId) {
      return NextResponse.json({ error: 'connectionId es requerido' }, { status: 400 });
    }

    const newTransactions = await StripeBankingService.syncTransactions(connectionId);

    return NextResponse.json({ 
      success: true, 
      count: newTransactions.length 
    });
  } catch (error: any) {
    console.error('[BankSync] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
