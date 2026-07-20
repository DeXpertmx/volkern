export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withTenantAuth } from '@/lib/api-key-auth';

// GET /api/ads/insights — Consultar insights agregados con filtros
export const GET = withTenantAuth(async (req, auth) => {
  try {
    const tenantId = auth.tenant!.id;
    const { searchParams } = new URL(req.url);

    const platformId = searchParams.get('platformId');
    const campaignId = searchParams.get('campaignId');
    const dateFrom = searchParams.get('dateFrom');
    const dateTo = searchParams.get('dateTo');
    const granularity = searchParams.get('granularity') || 'day'; // 'day' | 'campaign'

    // Construir filtro base
    const where: any = { tenantId };

    if (platformId) where.platformId = platformId;
    if (campaignId) where.campaignId = campaignId;
    if (dateFrom) where.dateStart = { ...(where.dateStart || {}), gte: new Date(dateFrom) };
    if (dateTo) where.dateEnd = { ...(where.dateEnd || {}), lte: new Date(dateTo) };

    const insights = await prisma.adInsight.findMany({
      where,
      select: {
        impressions: true,
        clicks: true,
        spend: true,
        conversions: true,
        cpc: true,
        ctr: true,
        cpa: true,
        roas: true,
        revenue: true,
        campaignId: true,
        dateStart: true,
        dateEnd: true,
      },
      orderBy: { dateStart: 'asc' },
    });

    // Si no hay datos, devolver ceros
    if (insights.length === 0) {
      const empty = {
        totalImpressions: 0,
        totalClicks: 0,
        totalSpend: 0,
        totalConversions: 0,
        totalRevenue: 0,
        avgCpc: 0,
        avgCtr: 0,
        avgCpa: 0,
        avgRoas: 0,
        records: [],
      };
      if (granularity === 'day') {
        return NextResponse.json({ ...empty, groupedBy: 'day' });
      }
      return NextResponse.json({ ...empty, groupedBy: 'campaign' });
    }

    // Totales agregados
    const totalImpressions = insights.reduce((s, i) => s + i.impressions, 0);
    const totalClicks = insights.reduce((s, i) => s + i.clicks, 0);
    const totalSpend = insights.reduce((s, i) => s + i.spend, 0);
    const totalConversions = insights.reduce((s, i) => s + i.conversions, 0);
    const totalRevenue = insights.reduce((s, i) => s + i.revenue, 0);

    const avgCpc = totalClicks > 0 ? totalSpend / totalClicks : 0;
    const avgCtr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;
    const avgCpa = totalConversions > 0 ? totalSpend / totalConversions : 0;
    const avgRoas = totalSpend > 0 ? totalRevenue / totalSpend : 0;

    // Agrupar según granularidad
    if (granularity === 'campaign' && campaignId) {
      // Agrupado por campaña — los insights ya están filtrados por campaignId
      // Si hay múltiples fechas, sumamos todo bajo esa campaña
      return NextResponse.json({
        totalImpressions,
        totalClicks,
        totalSpend,
        totalConversions,
        totalRevenue,
        avgCpc,
        avgCtr,
        avgCpa,
        avgRoas,
        groupedBy: 'campaign',
        records: insights,
      });
    }

    // Granularidad por día: agrupar por fecha (dateStart)
    const dailyMap = new Map<string, {
      date: string;
      impressions: number;
      clicks: number;
      spend: number;
      conversions: number;
      revenue: number;
      cpc: number;
      ctr: number;
      cpa: number;
      roas: number;
    }>();

    for (const ins of insights) {
      const key = ins.dateStart.toISOString().split('T')[0]; // YYYY-MM-DD
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
          cpc: 0,
          ctr: 0,
          cpa: 0,
          roas: 0,
        });
      }
    }

    // Calcular métricas derivadas por día
    for (const entry of dailyMap.values()) {
      entry.cpc = entry.clicks > 0 ? entry.spend / entry.clicks : 0;
      entry.ctr = entry.impressions > 0 ? (entry.clicks / entry.impressions) * 100 : 0;
      entry.cpa = entry.conversions > 0 ? entry.spend / entry.conversions : 0;
      entry.roas = entry.spend > 0 ? entry.revenue / entry.spend : 0;
    }

    const dailyRecords = Array.from(dailyMap.values()).sort((a, b) =>
      a.date.localeCompare(b.date)
    );

    return NextResponse.json({
      totalImpressions,
      totalClicks,
      totalSpend,
      totalConversions,
      totalRevenue,
      avgCpc,
      avgCtr,
      avgCpa,
      avgRoas,
      groupedBy: 'day',
      records: dailyRecords,
    });
  } catch (error: any) {
    console.error('[ADS_INSIGHTS] Error:', error);
    return NextResponse.json({ error: 'Error al consultar insights' }, { status: 500 });
  }
}, ['ads:read']);
