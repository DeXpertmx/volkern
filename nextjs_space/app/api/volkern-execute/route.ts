export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { globalPrisma } from '@/lib/db';
import { executeSkill } from '@/lib/skills';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const userId = body.userId;
    const tool = body.tool;
    const toolArgs = body.arguments || {};

    if (!userId || !tool) {
      return NextResponse.json({ error: 'Faltan userId o tool' }, { status: 400 });
    }

    const user = await globalPrisma.user.findUnique({
      where: { id: userId },
      include: { tenant: true }
    });

    if (!user || !user.tenantId) {
      return NextResponse.json({ error: 'Usuario no encontrado o sin tenant' }, { status: 404 });
    }

    const result = await executeSkill(tool as any, {
      ...toolArgs,
      tenantId: user.tenantId,
      userId: user.id
    });

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('[Execute] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}