import { NextRequest, NextResponse } from 'next/server';
import { globalPrisma } from '@/lib/db';

export const dynamic = 'force-dynamic';
import { isSuperadminRequest } from '@/lib/auth-helpers';
import { SaaSMetricsService } from '@/lib/saas-metrics';

export async function GET(request: NextRequest) {
  // Solo operadores Superadmin de la plataforma
  const auth = await isSuperadminRequest();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error || 'No autorizado' }, { status: 403 });
  }

  try {
    const searchParams = request.nextUrl.searchParams;
    const periodDays = parseInt(searchParams.get('periodDays') || '30');
    const tenantId = searchParams.get('tenantId') || undefined;

    const currentMetrics = await SaaSMetricsService.getCurrentMetrics();
    const history = await SaaSMetricsService.getMetricsHistory(periodDays);

    const activeCustomers = await globalPrisma.tenant.count({
      where: { estado: 'activo' }
    });

    const totalMRR = currentMetrics.mrr || await SaaSMetricsService.calculateMRR();
    const arr = totalMRR * 12;

    const churnRate = await SaaSMetricsService.calculateChurnRate(periodDays);
    const newCustomers = await SaaSMetricsService.calculateNewCustomers(periodDays);
    const churnedCustomers = await SaaSMetricsService.calculateChurnedCustomers(periodDays);
    const expansionRevenue = await SaaSMetricsService.calculateExpansionRevenue(periodDays);
    const contractionRevenue = await SaaSMetricsService.calculateContractionRevenue(periodDays);
    const trialConversionRate = await SaaSMetricsService.calculateTrialConversionRate(periodDays);

    const ltv = SaaSMetricsService.calculateLTV(totalMRR / (activeCustomers || 1), churnRate);

    return NextResponse.json({
      metrics: {
        mrr: totalMRR,
        arr,
        activeCustomers,
        newCustomers: await SaaSMetricsService.calculateNewCustomers(),
        churnedCustomers,
        churnRate,
        expansionRevenue,
        contractionRevenue,
        trialConversionRate
      },
      history,
      periodDays,
      calculatedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('[SaaS Metrics] Error fetching metrics:', error);
    return NextResponse.json(
      { error: 'Failed to fetch metrics', details: (error as Error).message },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  // Solo operadores Superadmin de la plataforma
  const auth = await isSuperadminRequest();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error || 'No autorizado' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { action, tenantId } = body;

    if (action === 'record') {
      const metrics = await SaaSMetricsService.recordMetrics(tenantId);
      return NextResponse.json({
        success: true,
        metrics,
        message: 'Metrics recorded successfully'
      });
    }

    if (action === 'snapshot') {
      await SaaSMetricsService.createSnapshot();
      return NextResponse.json({
        success: true,
        message: 'Snapshot created successfully'
      });
    }

    if (action === 'recalculate') {
      const metrics = await SaaSMetricsService.recordMetrics(tenantId);
      return NextResponse.json({
        success: true,
        metrics,
        message: 'Metrics recalculated successfully'
      });
    }

    return NextResponse.json(
      { error: 'Invalid action. Use: record, snapshot, or recalculate' },
      { status: 400 }
    );
  } catch (error) {
    console.error('[SaaS Metrics] Error processing action:', error);
    return NextResponse.json(
      { error: 'Failed to process action', details: (error as Error).message },
      { status: 500 }
    );
  }
}