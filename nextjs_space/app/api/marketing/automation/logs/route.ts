import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const ruleId = searchParams.get('ruleId');

  try {
    const logs = await prisma.automationLog.findMany({
      where: { 
        tenantId: session.user.tenantId,
        ...(ruleId ? { ruleId } : {})
      },
      orderBy: { executedAt: 'desc' },
      take: 50,
      include: {
        rule: {
          select: { name: true }
        }
      }
    });
    return NextResponse.json(logs);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
