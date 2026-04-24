import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withTenantAuth } from '@/lib/api-key-auth';

/**
 * GET /api/erp/inventory/movements - Listar historial de movimientos del tenant
 */
export const GET = withTenantAuth(async (request, auth) => {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '50');

    const movements = await prisma.stockMovement.findMany({
      where: {
        tenantId: auth.tenant!.id
      },
      include: {
        catalogoItem: {
          select: { id: true, nombre: true, sku: true }
        },
        warehouse: {
          select: { id: true, name: true }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: limit
    });

    return NextResponse.json(movements);
  } catch (error) {
    console.error('Error fetching inventory movements:', error);
    return NextResponse.json({ error: 'Error al cargar el historial de movimientos' }, { status: 500 });
  }
}, ['erp:read']);
