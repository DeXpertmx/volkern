export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const rules = await prisma.automationRule.findMany({
      where: { tenantId: session.user.tenantId },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: { logs: true }
        }
      }
    });
    return NextResponse.json(rules);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const data = await req.json();
    const rule = await prisma.automationRule.create({
      data: {
        ...data,
        tenantId: session.user.tenantId,
      }
    });
    
    // Auditoría
    console.log(`[Audit] Automation Rule created: ${rule.name} by ${session.user.email}`);
    
    return NextResponse.json(rule);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { id, ...data } = await req.json();
    const rule = await prisma.automationRule.update({
      where: { id, tenantId: session.user.tenantId },
      data
    });
    return NextResponse.json(rule);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
