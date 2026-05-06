export const dynamic = "force-dynamic";
// Re-sync with Prisma schema
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { MorningBriefingService } from '@/lib/sales/morning-briefing-service';

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || !(session.user as any).tenantId) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const userId = (session.user as any).id;
    const tenantId = (session.user as any).tenantId;

    const briefing = await MorningBriefingService.generateBriefing(userId, tenantId);

    return NextResponse.json(briefing);

  } catch (error: any) {
    console.error('Error in Morning Briefing API:', error);
    return NextResponse.json({ error: error.message || 'Error interno' }, { status: 500 });
  }
}
