import { NextResponse } from 'next/server';
import { SaaSMetricsService } from '@/lib/saas-metrics';

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const currentMRR = await SaaSMetricsService.calculateMRR();
    const now = new Date();
    const forecast: { month: string; actual: number | null; forecast: number; upper: number; lower: number }[] = [];

    const historicalMRR = currentMRR;
    const growthRate = 0.05;

    for (let i = -3; i <= 6; i++) {
      const monthDate = new Date(now.getFullYear(), now.getMonth() + i, 1);
      const monthName = monthDate.toLocaleDateString('es-ES', { month: 'short', year: '2-digit' });
      
      let actual: number | null = null;
      let forecastValue = historicalMRR * Math.pow(1 + growthRate, i);
      const variance = forecastValue * 0.1;

      if (i < 0) {
        actual = historicalMRR * Math.pow(1 + growthRate * 0.8, i);
        forecastValue = actual;
      }

      forecast.push({
        month: monthName,
        actual,
        forecast: Math.round(forecastValue),
        upper: Math.round(forecastValue + variance),
        lower: Math.round(forecastValue - variance)
      });
    }

    return NextResponse.json({ forecast });
  } catch (error) {
    console.error('[SaaS Revenue Forecast] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch revenue forecast', details: (error as Error).message },
      { status: 500 }
    );
  }
}
