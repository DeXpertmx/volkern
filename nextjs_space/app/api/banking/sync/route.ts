import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { StripeBankingService } from '@/lib/banking/stripe-banking-service';
import { PlaidBankingService } from '@/lib/banking/plaid-banking-service';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { connectionId } = await req.json();

    if (!connectionId) {
      return NextResponse.json({ error: 'connectionId es requerido' }, { status: 400 });
    }

    const connection = await prisma.bankConnection.findUnique({
      where: { id: connectionId }
    });

    if (!connection) {
      return NextResponse.json({ error: 'Conexión no encontrada' }, { status: 404 });
    }

    let count = 0;
    if (connection.provider === 'PLAID') {
      count = await PlaidBankingService.syncTransactions(connectionId);
    } else {
      const newTransactions = await StripeBankingService.syncTransactions(connectionId);
      count = newTransactions.length;
    }

    return NextResponse.json({ 
      success: true, 
      count
    });
  } catch (error: any) {
    console.error('[BankSync] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
