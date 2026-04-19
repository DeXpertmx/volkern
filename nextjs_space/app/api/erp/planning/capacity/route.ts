import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withTenantAuth } from '@/lib/api-key-auth';
import { PlanningService } from '@/lib/erp/planning-service';

/**
 * GET /api/erp/planning/capacity - Obtener forecast de capacidad
 */
export const GET = withTenantAuth(async (request, auth) => {
  try {
    const tenantId = auth.tenant!.id;
    const forecast = await PlanningService.generate7DayForecast(tenantId);
    
    // También obtener líneas para el dashboard
    const lines = await prisma.productionLine.findMany({
      where: { tenantId },
      include: {
        assets: true,
        workOrders: {
          where: { status: 'IN_PROGRESS' }
        }
      }
    });

    return NextResponse.json({ forecast, lines });
  } catch (error) {
    console.error('Error fetching planning capacity:', error);
    return NextResponse.json({ error: 'Error al cargar datos de planificación' }, { status: 500 });
  }
}, ['erp:read']);
