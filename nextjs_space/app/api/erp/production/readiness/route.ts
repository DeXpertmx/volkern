export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withTenantAuth } from '@/lib/api-key-auth';
import { ReadinessService } from '@/lib/erp/readiness-service';

/**
 * GET /api/erp/production/readiness - Listar estado de preparación de órdenes
 */
export const GET = withTenantAuth(async (request, auth) => {
  try {
    const tenantId = auth.tenant!.id;
    const readiness = await (prisma as any).erp_production_readiness.findMany({
      where: { tenantId },
      include: {
        erp_work_orders: {
          include: {
            bom: { include: { catalogoItem: true } },
            erp_material_requirements: {
              include: { catalogItem: true }
            }
          }
        }
      },
      orderBy: { coveragePercent: 'desc' }
    });

    return NextResponse.json(readiness);
  } catch (error) {
    console.error('Error fetching readiness:', error);
    return NextResponse.json({ error: 'Error al cargar preparación de producción' }, { status: 500 });
  }
}, ['erp:read']);

/**
 * POST /api/erp/production/readiness/release - Liberar orden para producción
 */
export const POST = withTenantAuth(async (request, auth) => {
  try {
    const tenantId = auth.tenant!.id;
    const { workOrderId } = await request.json();
    
    if (!workOrderId) return NextResponse.json({ error: 'Falta workOrderId' }, { status: 400 });

    const result = await ReadinessService.releaseWorkOrder(workOrderId, tenantId, auth.user!.id);
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}, ['erp:write']);
