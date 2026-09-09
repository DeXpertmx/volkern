export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/db';
import { markFirstMessageSeen } from '@/lib/onboarding/first-message';

async function getTenantId(): Promise<{ tenantId: string } | { error: NextResponse }> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return { error: NextResponse.json({ hasFirstMessage: false }, { status: 401 }) };
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    include: { tenant: true },
  });

  if (!user || !user.tenantId) {
    return { error: NextResponse.json({ hasFirstMessage: false }, { status: 404 }) };
  }

  return { tenantId: user.tenantId };
}

/**
 * GET /api/onboarding/check-first-message
 * Lectura pura: responde si el tenant ya recibió su primer mensaje en Telegram.
 * No escribe en BD (antes hacía un upsert de `primerMensaje` como efecto
 * secundario). El marcado ahora se hace explícitamente vía POST.
 */
export async function GET(req: NextRequest) {
  try {
    const ctx = await getTenantId();
    if ('error' in ctx) return ctx.error;

    const channel = await prisma.channel.findFirst({
      where: {
        tenantId: ctx.tenantId,
        type: 'telegram',
      },
    });

    if (!channel) {
      return NextResponse.json({ hasFirstMessage: false });
    }

    const recentMessages = await prisma.message.findMany({
      where: {
        channelId: channel.id,
      },
      orderBy: {
        createdAt: 'desc',
      } as any,
      take: 10,
    } as any);

    const hasFirstMessage = recentMessages.length > 0;

    return NextResponse.json({ hasFirstMessage });
  } catch (error: any) {
    console.error('[Check First Message] Error:', error);
    return NextResponse.json({ hasFirstMessage: false }, { status: 500 });
  }
}

/**
 * POST /api/onboarding/check-first-message
 * Marca "primer mensaje visto" en el progreso de onboarding (idempotente).
 * La escritura que antes vivía dentro del GET se movió aquí para que las
 * lecturas no tengan efectos secundarios.
 */
export async function POST(req: NextRequest) {
  try {
    const ctx = await getTenantId();
    if ('error' in ctx) return ctx.error;

    await markFirstMessageSeen(ctx.tenantId);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[Check First Message] Error marcando primer mensaje:', error);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}