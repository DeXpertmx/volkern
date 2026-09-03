import { NextRequest, NextResponse } from 'next/server';
import { globalPrisma } from '@/lib/db';

export const dynamic = 'force-dynamic';
import { isSuperadminRequest } from '@/lib/auth-helpers';

export async function GET() {
  // Solo operadores Superadmin de la plataforma
  const auth = await isSuperadminRequest();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error || 'No autorizado' }, { status: 403 });
  }

  try {
    const cancelllations = await globalPrisma.subscription.findMany({
      where: { estado: 'cancelada' },
      select: { metadata: true }
    });

    const reasons: Record<string, number> = {};
    let totalChurned = 0;

    for (const sub of cancelllations) {
      const reason = (sub.metadata as any)?.churnReason || 'Sin especificar';
      reasons[reason] = (reasons[reason] || 0) + 1;
      totalChurned += 1;
    }

    const reasonList = Object.entries(reasons).map(([reason, count]) => ({
      reason,
      count,
      percentage: totalChurned > 0 ? (count / totalChurned) * 100 : 0
    })).sort((a, b) => b.count - a.count);

    return NextResponse.json({ reasons: reasonList, totalChurned });
  } catch (error) {
    console.error('[SaaS Churn Reasons] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch churn reasons', details: (error as Error).message },
      { status: 500 }
    );
  }
}