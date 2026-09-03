import { NextRequest, NextResponse } from 'next/server';
import { SaaSMetricsService } from '@/lib/saas-metrics';

export const dynamic = 'force-dynamic';
import { isSuperadminRequest } from '@/lib/auth-helpers';

export async function GET(request: NextRequest) {
  // Solo operadores Superadmin de la plataforma
  const auth = await isSuperadminRequest();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error || 'No autorizado' }, { status: 403 });
  }

  try {
    const searchParams = request.nextUrl.searchParams;
    const limit = parseInt(searchParams.get('limit') || '30');

    const snapshots = await SaaSMetricsService.getSnapshots(limit);

    return NextResponse.json({
      snapshots,
      count: snapshots.length,
      fetchedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('[SaaS Metrics Snapshots] Error fetching snapshots:', error);
    return NextResponse.json(
      { error: 'Failed to fetch snapshots', details: (error as Error).message },
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
    const { force } = body;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (!force) {
      const existingSnapshots = await SaaSMetricsService.getSnapshots(1);
      if (existingSnapshots.length > 0) {
        const lastSnapshotDate = new Date(existingSnapshots[0].date);
        lastSnapshotDate.setHours(0, 0, 0, 0);
        
        if (lastSnapshotDate.getTime() === today.getTime()) {
          return NextResponse.json({
            success: true,
            message: 'Snapshot already exists for today',
            snapshot: existingSnapshots[0]
          });
        }
      }
    }

    await SaaSMetricsService.createSnapshot();
    const snapshots = await SaaSMetricsService.getSnapshots(1);

    return NextResponse.json({
      success: true,
      message: 'Manual snapshot created successfully',
      snapshot: snapshots[0]
    });
  } catch (error) {
    console.error('[SaaS Metrics Snapshots] Error creating snapshot:', error);
    return NextResponse.json(
      { error: 'Failed to create snapshot', details: (error as Error).message },
      { status: 500 }
    );
  }
}