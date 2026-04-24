import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { QualityService } from '@/lib/erp/quality-service';

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || !(session.user as any).tenantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const tenantId = (session.user as any).tenantId;

  try {
    console.log('Fetching QC stats for tenant:', tenantId);
    const stats = await QualityService.getQualityStats(tenantId);
    console.log('Stats fetched:', stats);

    console.log('Fetching QC points...');
    const points = await QualityService.getControlPoints(tenantId);

    console.log('Fetching QC inspections...');
    const inspections = await QualityService.getRecentInspections(tenantId);

    console.log('Fetching QC issues...');
    const issues = await QualityService.getNonConformities(tenantId);

    return NextResponse.json({
      stats,
      points,
      inspections,
      issues
    });
  } catch (error: any) {
    console.error('Error fetching QC data:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
