export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withTenantAuth } from '@/lib/api-key-auth';
import { ProductionService } from '@/lib/erp/production-service';

/**
 * POST /api/erp/production/work-orders/[id]/start
 * Inicia una orden de trabajo validando competencias.
 */
export const POST = withTenantAuth(async (request, auth, { params }) => {
  try {
    const tenantId = auth.tenant!.id;
    const workOrderId = params.id;
    const userId = auth.user!.id;

    // ProductionService now handles SkillGuard internally if userId is provided
    const result = await ProductionService.startProduction(workOrderId, tenantId, userId);

    return NextResponse.json({
      success: true,
      workOrder: result
    });
  } catch (error: any) {
    console.error('Error starting production:', error);
    return NextResponse.json({ error: error.message }, { status: 403 });
  }
}, ['erp:write']);
