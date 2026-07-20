export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withTenantAuth } from '@/lib/api-key-auth';
import { syncPlatformFull } from '@/lib/ads/sync-engine';

// POST /api/ads/campaigns/[id]/sync - Forzar sincronización de campaña
export const POST = withTenantAuth(async (req, auth, context) => {
  try {
    const { id } = await context.params;
    const tenantId = auth.tenant!.id;

    const campaign = await prisma.adCampaign.findUnique({
      where: { id, tenantId },
      select: { platformId: true },
    });

    if (!campaign) {
      return NextResponse.json({ error: 'Campaña no encontrada' }, { status: 404 });
    }

    if (!campaign.platformId) {
      return NextResponse.json({ error: 'La campaña no está vinculada a ninguna plataforma' }, { status: 400 });
    }

    const result = await syncPlatformFull(tenantId, campaign.platformId);

    return NextResponse.json({
      success: result.success,
      result,
    });
  } catch (error: any) {
    console.error('[ADS_CAMPAIGN_SYNC] Error:', error);
    return NextResponse.json({ error: 'Error al sincronizar campaña' }, { status: 500 });
  }
}, ['ads:manage']);
