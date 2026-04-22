import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { AutoReconciler } from '@/lib/accounting/auto-reconciler';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const suggestions = await AutoReconciler.getSuggestions(session.user.tenantId);
    return NextResponse.json(suggestions);
  } catch (error: any) {
    console.error('[Reconciliation] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
