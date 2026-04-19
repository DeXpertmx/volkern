import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || !(session.user as any).tenantId) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const dealId = params.id;

    const logs = await prisma.aiDecisionLog.findMany({
      where: { dealId },
      orderBy: { timestamp: 'desc' },
      take: 50
    });

    return NextResponse.json(logs);

  } catch (error: any) {
    console.error('Error in AI Audit API:', error);
    return NextResponse.json({ error: error.message || 'Error interno' }, { status: 500 });
  }
}
