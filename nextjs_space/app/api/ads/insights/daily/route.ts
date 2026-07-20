export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withTenantAuth } from '@/lib/api-key-auth';

// GET /api/ads/insights/daily — Serie de tiempo diaria de métricas ADS
export const GET = withTenantAuth(async (req, auth) => {
  try {
    const tenantId = auth.tenant!.id;
    const { searchParams } = new URL(req.url);

    const platformId = searchParams.get('platformId');
    const campaignId = searchParams.get('campaignId');
    const days = parseInt(searchParams.get('days') || '30', 10);

    // Calcular fecha de inicio
    const since = new Date();
    since.setDate(since.getDate() - Math.max(1, Math.min(days, 365))); // entre 1 y 365 días

    // Construir filtro
    const where: any = {
      tenantId,
      dateStart: { gte: since },
    };

    if (platformId) where.platformId = platformId;
    if (campaignId) where.campaignId = campaignId;

    const insights = await prisma.adInsight.findMany({
      where,
      select: {
        dateStart: true,
        dateEnd: true,
        impressions: true,
        clicks: true,
        spend: true,
        conversions: true,
        revenue: true,
        cpa: true,
        roas: true,
      },
      orderBy: { dateStart: 'asc' },
    });

    if (insights.length === 0) {
      return NextResponse.json({ records: [] });
    }

    // Agrupar por día (YYYY-MM-DD)
    const dailyMap = new Map<string, {
      date: string;
      impressions: number;
      clicks: number;
      spend: number;
      conversions: number;
      revenue: number;
      cpa: number;
      roas: number;
    }>();

    for (const ins of insights) {
      const key = ins.dateStart.toISOString().split('T')[0];
      const existing = dailyMap.get(key);
      if (existing) {
        existing.impressions += ins.impressions;
        existing.clicks += ins.clicks;
        existing.spend += ins.spend;
        existing.conversions += ins.conversions;
        existing.revenue += ins.revenue;
      } else {
        dailyMap.set(key, {
          date: key,
          impressions: ins.impressions,
          clicks: ins.clicks,
          spend: ins.spend,
          conversions: ins.conversions,
          revenue: ins.revenue,
          cpa: 0,
          roas: 0,
        });
      }
    }

    // Calcular métricas derivadas por día
    for (const entry of dailyMap.values()) {
      entry.cpa = entry.conversions > 0 ? entry.spend / entry.conversions : 0;
      entry.roas = entry.spend > 0 ? entry.revenue / entry.spend : 0;
    }

    const records = Array.from(dailyMap.values()).sort((a, b) =>
      a.date.localeCompare(b.date)
    );

    return NextResponse.json({ records });
  } catch (error: any) {
    console.error('[ADS_DAILY] Error:', error);
    return NextResponse.json({ error: 'Error al obtener datos diarios' }, { status: 500 });
  }
}, ['ads:read']);
