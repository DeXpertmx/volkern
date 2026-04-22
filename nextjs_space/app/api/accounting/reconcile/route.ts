import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { BankingService } from '@/lib/accounting/banking-service';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const transactionId = request.nextUrl.searchParams.get('transactionId');
  
  if (transactionId) {
    try {
      const suggestions = await BankingService.suggestReconciliations(transactionId);
      return NextResponse.json(suggestions);
    } catch (error: any) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  // If no transactionId, return all unreconciled transactions for the tenant
  try {
    const transactions = await prisma.bankTransaction.findMany({
      where: {
        bankConnection: { tenantId: session.user.tenantId },
        isReconciled: false
      },
      include: { bankConnection: true },
      orderBy: { date: 'desc' }
    });
    return NextResponse.json(transactions);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { transactionId, entryId, matchedBy } = await request.json();

    if (!transactionId || !entryId) {
      return NextResponse.json({ error: 'transactionId and entryId are required' }, { status: 400 });
    }

    const result = await BankingService.reconcile(transactionId, entryId, matchedBy || 'USER');
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
