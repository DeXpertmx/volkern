export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { globalPrisma } from '@/lib/db';
import { skills, listSkills, executeSkill } from '@/lib/skills';

export async function POST(req: NextRequest, { params }: { params: { userId: string } }) {
  const { userId } = params;

  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    let args = {};
    try {
      args = await req.json();
    } catch {
      args = {};
    }
    const tool = args.tool || args.action;
    const toolArgs = args.arguments || args.args || {};

    console.log('[AgentSkill] Tool:', tool, 'Args:', toolArgs);

    // Validar usuario
    const user = await globalPrisma.user.findUnique({
      where: { id: userId },
      include: { tenant: true }
    });

    if (!user) {
      return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 });
    }

    console.log('[AgentSkill] User:', user.id, 'tenant:', user.tenantId);

    if (!user.tenantId) {
      return NextResponse.json({ error: 'Usuario sin tenant' }, { status: 400 });
    }

    // Ejecutar skill
    const payloadWithContext = {
      ...toolArgs,
      tenantId: user.tenantId,
      userId: user.id
    };

    const result = await executeSkill(tool as any, payloadWithContext);
    return NextResponse.json(result);
  } catch (error: any) {
    console.error('[AgentSkill] Error:', error);
    return NextResponse.json({ error: 'Error: ' + error.message }, { status: 500 });
  }
}