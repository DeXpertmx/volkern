export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withTenantAuth } from '@/lib/api-key-auth';

// GET /api/ads/insights/summary — Executive summary de métricas ADS del tenant
export const GET = withTenantAuth(async (req, auth) => {
  try {
    const tenantId = auth.tenant!.id;

    // Obtener plataformas conectadas
    const platforms = await prisma.adPlatformConnection.findMany({
      where: { tenantId, status: 'CONNECTED' },
      select: { id: true, platform: true, accountName: true },
    });

    // Obtener campañas activas
    const activeCampaignsCount = await prisma.adCampaign.count({
      where: { tenantId, status: 'ACTIVE' },
    });

    // Obtener todos los insights del tenant
    const insights = await prisma.adInsight.findMany({
      where: { tenantId },
      select: {
        platformId: true,
        impressions: true,
        clicks: true,
        spend: true,
        conversions: true,
        revenue: true,
        cpa: true,
        roas: true,
        platform: { select: { platform: true } },
      },
    });

    const totalImpressions = insights.reduce((s, i) => s + i.impressions, 0);
    const totalClicks = insights.reduce((s, i) => s + i.clicks, 0);
    const totalSpend = insights.reduce((s, i) => s + i.spend, 0);
    const totalConversions = insights.reduce((s, i) => s + i.conversions, 0);
    const totalRevenue = insights.reduce((s, i) => s + i.revenue, 0);

    const avgCPA = totalConversions > 0 ? totalSpend / totalConversions : 0;
    const avgROAS = totalSpend > 0 ? totalRevenue / totalSpend : 0;

    // Breakdown por plataforma
    const platformBreakdown = platforms.map((p) => {
      const platformInsights = insights.filter((i) => i.platformId === p.id);
      const pImp = platformInsights.reduce((s, i) => s + i.impressions, 0);
      const pClicks = platformInsights.reduce((s, i) => s + i.clicks, 0);
      const pSpend = platformInsights.reduce((s, i) => s + i.spend, 0);
      const pConv = platformInsights.reduce((s, i) => s + i.conversions, 0);
      const pRev = platformInsights.reduce((s, i) => s + i.revenue, 0);

      const activeCampaignsForPlatform = activeCampaignsCount; // Simplificación: contamos global

      return {
        platform: p.platform,
        accountName: p.accountName,
        totalSpend: pSpend,
        totalImpressions: pImp,
        totalClicks: pClicks,
        totalConversions: pConv,
        totalRevenue: pRev,
        avgCPA: pConv > 0 ? pSpend / pConv : 0,
        avgROAS: pSpend > 0 ? pRev / pSpend : 0,
        activeCampaigns: activeCampaignsForPlatform,
      };
    });

    return NextResponse.json({
      totalSpend,
      totalImpressions,
      totalClicks,
      totalConversions,
      totalRevenue,
      avgCPA,
      avgROAS,
      activeCampaigns: activeCampaignsCount,
      connectedPlatforms: platforms.length,
      platformBreakdown,
    });
  } catch (error: any) {
    console.error('[ADS_SUMMARY] Error:', error);
    return NextResponse.json({ error: 'Error al obtener resumen ejecutivo' }, { status: 500 });
  }
}, ['ads:read']);
