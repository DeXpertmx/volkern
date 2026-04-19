import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withTenantAuth } from '@/lib/api-key-auth';
import { SchedulingService } from '@/lib/erp/scheduling-service';

/**
 * GET /api/erp/planning/scheduling - Obtener plan de secuenciación activo
 */
export const GET = withTenantAuth(async (request, auth) => {
  try {
    const tenantId = auth.tenant!.id;
    const plan = await prisma.schedulingPlan.findFirst({
      where: { tenantId, status: { in: ['ACTIVE', 'DRAFT'] } },
      include: {
        assignments: {
          include: {
            workOrder: {
              include: {
                bom: { include: { catalogoItem: true } }
              }
            },
            line: true
          },
          orderBy: { estimatedStart: 'asc' }
        }
      },
      orderBy: { generatedAt: 'desc' }
    });

    return NextResponse.json(plan);
  } catch (error) {
    console.error('Error fetching scheduling plan:', error);
    return NextResponse.json({ error: 'Error al cargar el plan de secuenciación' }, { status: 500 });
  }
}, ['erp:read']);

/**
 * POST /api/erp/planning/scheduling/generate - Generar nuevo plan optimizado
 */
export const POST = withTenantAuth(async (request, auth) => {
  try {
    const tenantId = auth.tenant!.id;
    const result = await SchedulingService.generateOptimalSchedule(tenantId);
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}, ['erp:write']);
