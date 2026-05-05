import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withTenantAuth } from '@/lib/api-key-auth';

export const GET = withTenantAuth(async (request, auth) => {
  try {
    const tenantId = auth.tenant!.id;

    const maintenance = await prisma.assetMaintenance.findMany({
      where: { tenantId },
      include: {
        asset: {
          select: { name: true, serialNumber: true }
        }
      },
      orderBy: { date: 'desc' }
    });

    return NextResponse.json(maintenance);
  } catch (error: any) {
    console.error('[AssetsMaintenance] Error:', error);
    return NextResponse.json({ error: 'Error al cargar mantenimientos' }, { status: 500 });
  }
}, { requiredScopes: ['hr:read'] });
