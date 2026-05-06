export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withTenantAuth } from '@/lib/api-key-auth';

export const GET = withTenantAuth(async (request, auth) => {
  try {
    const tenantId = auth.tenant!.id;

    const events = await prisma.assetEvent.findMany({
      where: { tenantId },
      include: {
        asset: {
          select: { name: true, serialNumber: true }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: 100
    });

    return NextResponse.json(events);
  } catch (error: any) {
    console.error('[AssetsEvents] Error:', error);
    return NextResponse.json({ error: 'Error al cargar trazabilidad' }, { status: 500 });
  }
}, { requiredScopes: ['hr:read'] });
