export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || !(session.user as any).tenantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const tenantId = (session.user as any).tenantId;

  try {
    const employees = await (prisma as any).employee.findMany({
      where: { tenantId, isActive: true },
      select: {
        id: true,
        fullName: true,
        role: true,
        department: true,
        managerId: true,
        user: {
          select: {
            image: true
          }
        }
      }
    });

    return NextResponse.json(employees);
  } catch (error) {
    console.error('[ORG_CHART_GET]', error);
    return NextResponse.json({ error: 'Error al obtener organigrama' }, { status: 500 });
  }
}
