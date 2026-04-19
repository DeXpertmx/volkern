export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { PipelineWatchdog } from '@/lib/sales/pipeline-watchdog';
import { PipelineHealthService } from '@/lib/sales/pipeline-health-service';

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || !(session.user as any).tenantId) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const tenantId = (session.user as any).tenantId;

    // Ejecutar Vigilancia y Recálculo
    const watchdogResult = await PipelineWatchdog.runWatchdog(tenantId);
    
    // Obtener Forecast Actualizado
    const forecast = await PipelineHealthService.getExecutiveMetrics(tenantId);

    return NextResponse.json({
      success: true,
      watchdog: watchdogResult,
      forecast
    });

  } catch (error) {
    console.error('Error in Pipeline Sync:', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
