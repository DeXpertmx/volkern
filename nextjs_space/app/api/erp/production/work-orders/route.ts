export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withTenantAuth } from '@/lib/api-key-auth';

/**
 * GET /api/erp/production/work-orders - Listar órdenes de fabricación
 */
export const GET = withTenantAuth(async (request, auth) => {
  try {
    const tenantId = auth.tenant!.id;

    const workOrders = await prisma.workOrder.findMany({
      where: {
        tenantId: tenantId,
      },
      include: {
        bom: {
          include: {
            catalogoItem: {
              select: {
                id: true,
                nombre: true,
                sku: true,
              }
            }
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    return NextResponse.json(workOrders);
  } catch (error) {
    console.error('Error fetching work orders:', error);
    return NextResponse.json({ error: 'Error al cargar órdenes de trabajo' }, { status: 500 });
  }
}, ['erp:read']);
