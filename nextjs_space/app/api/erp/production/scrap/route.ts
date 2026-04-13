import { NextResponse } from 'next/server';
import { withTenantAuth } from '@/lib/api-key-auth';
import { ProductionService } from '@/lib/erp/production-service';

/**
 * POST /api/erp/production/scrap
 * Reporta merma (scrap) de producción con validación VISION-LOCK
 */
export const POST = withTenantAuth(async (request, auth) => {
  try {
    const body = await request.json();
    const { 
      workOrderId, 
      itemId, 
      quantity, 
      evidenceUrl, 
      lat, 
      lng, 
      timestamp 
    } = body;

    if (!workOrderId || !itemId || quantity === undefined || !evidenceUrl) {
      return NextResponse.json({ 
        error: 'workOrderId, itemId, quantity y evidenceUrl son obligatorios' 
      }, { status: 400 });
    }

    const result = await ProductionService.reportWaste({
      tenantId: auth.tenant!.id,
      workOrderId,
      itemId,
      quantity: parseFloat(quantity),
      evidenceUrl,
      userId: auth.user?.id,
      reportLat: lat,
      reportLng: lng,
      clientTimestamp: timestamp
    });

    return NextResponse.json(result);

  } catch (error) {
    console.error('Error in production scrap API:', error);
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Error interno al reportar merma' 
    }, { status: 500 });
  }
}, ['erp:write']);
