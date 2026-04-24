import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withTenantAuth } from '@/lib/api-key-auth';

/**
 * GET /api/erp/production/costing - Listar datos de costeo y rentabilidad
 */
export const GET = withTenantAuth(async (request, auth) => {
  try {
    const tenantId = auth.tenant!.id;
    const costingData = await (prisma as any).erp_production_costing.findMany({
      where: { tenantId },
      include: {
        erp_work_orders: {
          include: {
            bom: { include: { catalogoItem: true } }
          }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: 20
    });
    return NextResponse.json(costingData);
  } catch (error) {
    console.error('Error fetching costing data:', error);
    return NextResponse.json({ error: 'Error al cargar datos de costos' }, { status: 500 });
  }
}, ['erp:read']);
