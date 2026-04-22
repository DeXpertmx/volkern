import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { EntryManager } from '@/lib/accounting/entry-manager';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const tenantId = session?.user?.tenantId || request.nextUrl.searchParams.get('tenantId') || 'cmo09jrkc0000mf0ebul7xe9q';

    // 1. Get account balances
    const accounts = await prisma.accountingAccount.findMany({
      where: { tenantId }
    });

    const summary = {
      assets: accounts.filter(a => a.type === 'ACTIVO').reduce((s, a) => s + Number(a.balance), 0),
      liabilities: accounts.filter(a => a.type === 'PASIVO').reduce((s, a) => s + Number(a.balance), 0),
      expenses: accounts.filter(a => a.type === 'GASTO').reduce((s, a) => s + Number(a.balance), 0),
      income: accounts.filter(a => a.type === 'INGRESO').reduce((s, a) => s + Number(a.balance), 0)
    };

    // 2. Get recent entries
    const recentEntries = await prisma.accountingEntry.findMany({
      where: { tenantId },
      orderBy: { date: 'desc' },
      take: 5,
      include: { lines: { include: { account: true } } }
    });

    // 3. Verify integrity
    const integrity = await EntryManager.verifyLedgerIntegrity(tenantId);

    // 4. Get bank status
    const bankConnections = await prisma.bankConnection.findMany({
      where: { tenantId },
      include: { _count: { select: { transactions: { where: { isReconciled: false } } } } }
    });

    return NextResponse.json({
      summary,
      recentEntries,
      integrity,
      bankConnections,
      serverTime: new Date().toISOString()
    });
  } catch (error: any) {
    console.error('Error fetching accounting dashboard:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
