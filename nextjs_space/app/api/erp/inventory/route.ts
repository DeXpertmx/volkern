import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withTenantAuth } from '@/lib/api-key-auth';
import { skills } from '@/lib/skills';

/**
 * GET /api/erp/inventory - Listar existencias consolidadas
 */
export const GET = withTenantAuth(async (request, auth) => {
  try {
    const { searchParams } = new URL(request.url);
    const warehouseId = searchParams.get('warehouseId');
    const catalogoItemId = searchParams.get('catalogoItemId');
    const search = searchParams.get('search');

    const where: any = {
      tenantId: auth.tenant!.id
    };

    if (warehouseId) where.warehouseId = warehouseId;
    if (catalogoItemId) where.catalogoItemId = catalogoItemId;
    if (search) {
      where.catalogoItem = {
        OR: [
          { nombre: { contains: search, mode: 'insensitive' } },
          { sku: { contains: search, mode: 'insensitive' } }
        ]
      };
    }

    const stockLevels = await prisma.stockLevel.findMany({
      where,
      include: {
        warehouse: { select: { id: true, name: true } },
        catalogoItem: { select: { id: true, nombre: true, sku: true, unidad: true } }
      },
      orderBy: { catalogoItem: { nombre: 'asc' } }
    });

    return NextResponse.json(stockLevels);
  } catch (error) {
    console.error('Error fetching inventory:', error);
    return NextResponse.json({ error: 'Error al cargar inventario' }, { status: 500 });
  }
}, ['erp:read']);

/**
 * POST /api/erp/inventory/adjust - Ajustar stock manualmente
 */
export const POST = withTenantAuth(async (request, auth) => {
  try {
    const body = await request.json();
    
    if (!body.catalogoItemId || !body.quantity || !body.type) {
      return NextResponse.json({ error: 'Faltan campos obligatorios' }, { status: 400 });
    }

    const result = await skills.adjust_stock({
      tenantId: auth.tenant!.id,
      userId: auth.user!.id,
      catalogoItemId: body.catalogoItemId,
      warehouseId: body.warehouseId,
      type: body.type,
      quantity: parseFloat(body.quantity),
      reason: body.reason || 'Ajuste manual desde API',
      referenceId: body.referenceId,
      targetWarehouseId: body.targetWarehouseId
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error adjusting stock:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Error al ajustar stock' }, { status: 500 });
  }
}, ['erp:write']);
