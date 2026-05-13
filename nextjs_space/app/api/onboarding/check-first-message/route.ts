export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/db';

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ hasFirstMessage: false }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: { tenant: true }
    });

    if (!user || !user.tenantId) {
      return NextResponse.json({ hasFirstMessage: false }, { status: 404 });
    }

    const channel = await prisma.channel.findFirst({
      where: {
        tenantId: user.tenantId,
        type: 'telegram'
      }
    });

    if (!channel) {
      return NextResponse.json({ hasFirstMessage: false });
    }

    const recentMessages = await prisma.message.findMany({
      where: {
        channelId: channel.id
      },
      orderBy: {
        createdAt: 'desc'
      },
      take: 10
    });

    const hasFirstMessage = recentMessages.length > 0;

    if (hasFirstMessage) {
      await prisma.onboardingProgress.upsert({
        where: { tenantId: user.tenantId },
        update: {
          primerMensaje: true,
          fechaPrimerMensaje: new Date()
        },
        create: {
          tenantId: user.tenantId,
          primerMensaje: true,
          fechaPrimerMensaje: new Date()
        }
      });
    }

    return NextResponse.json({ hasFirstMessage });

  } catch (error: any) {
    console.error('[Check First Message] Error:', error);
    return NextResponse.json({ hasFirstMessage: false }, { status: 500 });
  }
}