export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withTenantAuth } from '@/lib/api-key-auth';

/**
 * GET /api/analytics/training/playbook
 * Retorna las mejores prácticas cosechadas por la IA para el Playbook de Ventas.
 */
export const GET = withTenantAuth(async (req, auth) => {
  try {
    const tenantId = auth.tenant!.id;

    const playbook = await prisma.salesPlaybookEntry.findMany({
      where: { 
        tenantId,
        status: 'approved'
      },
      include: {
        agent: {
          select: { name: true, image: true }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: 10
    });

    return NextResponse.json({
      success: true,
      data: playbook
    });
  } catch (error) {
    console.error('Error in Playbook API:', error);
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
  }
});
