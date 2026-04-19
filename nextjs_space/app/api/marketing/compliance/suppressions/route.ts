import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const suppressions = await prisma.marketingSuppression.findMany({
      where: { tenantId: session.user.tenantId },
      orderBy: { createdAt: 'desc' }
    });
    return NextResponse.json(suppressions);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { email, reason } = await req.json();
    const suppression = await prisma.marketingSuppression.create({
      data: {
        tenantId: session.user.tenantId,
        email: email.toLowerCase(),
        reason,
        source: 'MANUAL'
      }
    });
    return NextResponse.json(suppression);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
