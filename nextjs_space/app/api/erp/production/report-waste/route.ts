import { NextResponse } from 'next/server';
import { withTenantAuth } from '@/lib/api-key-auth';
import { ProductionService } from '@/lib/erp/production-service';

export const POST = withTenantAuth(async (request, auth) => {
  try {
    const tenantId = auth.tenant!.id;
    const userId = auth.user!.id;
    const body = await request.json();

    const { 
      workOrderId, 
      itemId, 
      quantity, 
      evidenceUrl,
      reportLat,
      reportLng,
      clientTimestamp 
    } = body;

    if (!workOrderId || !evidenceUrl || !quantity) {
      return NextResponse.json({ error: 'Datos incompletos' }, { status: 400 });
    }

    const result = await ProductionService.reportWaste({
      tenantId,
      userId,
      workOrderId,
      itemId,
      quantity: Number(quantity),
      evidenceUrl,
      reportLat: reportLat ? Number(reportLat) : undefined,
      reportLng: reportLng ? Number(reportLng) : undefined,
      clientTimestamp
    });

    return NextResponse.json(result);

  } catch (error: any) {
    console.error('[ReportWasteAPI] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Error al procesar el reporte de merma' }, 
      { status: 403 } // 403 para indicar rechazo de integridad
    );
  }
}, ['erp:write']);
