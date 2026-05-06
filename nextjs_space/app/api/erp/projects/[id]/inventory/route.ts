export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withTenantAuth } from '@/lib/api-key-auth';
import { StockService } from '@/lib/erp/stock-service';

/**
 * GET /api/erp/projects/[id]/inventory - Listar consumos de materiales del proyecto
 */
export const GET = withTenantAuth(async (request, auth, { params }) => {
  try {
    const { id: projectId } = params;

    const movements = await prisma.stockMovement.findMany({
      where: {
        projectId,
        tenantId: auth.tenant!.id
      },
      include: {
        catalogoItem: { select: { id: true, nombre: true, sku: true } },
        warehouse: { select: { id: true, nombre: true } }
      },
      orderBy: { createdAt: 'desc' }
    });

    return NextResponse.json(movements);
  } catch (error) {
    console.error('Error fetching project inventory:', error);
    return NextResponse.json({ error: 'Error al cargar inventario del proyecto' }, { status: 500 });
  }
}, ['erp:read']);

/**
 * POST /api/erp/projects/[id]/inventory - Registrar consumo de material para el proyecto
 */
export const POST = withTenantAuth(async (request, auth, { params }) => {
  try {
    const { id: projectId } = params;
    const body = await request.json();

    if (!body.catalogoItemId || !body.warehouseId || !body.quantity) {
      return NextResponse.json({ error: 'Faltan campos obligatorios (catalogoItemId, warehouseId, quantity)' }, { status: 400 });
    }

    // Registrar el movimiento de salida (OUT) tipo CONSUMPTION
    const movement = await StockService.registerMovement({
      tenantId: auth.tenant!.id,
      warehouseId: body.warehouseId,
      catalogoItemId: body.catalogoItemId,
      lotId: body.lotId,
      type: 'OUT',
      quantity: -Math.abs(body.quantity), // Negativo porque es salida
      reason: body.reason || `Consumo para proyecto ${projectId}`,
      referenceId: projectId,
      metadata: {
        projectId,
        source: 'projects_module'
      }
    });

    // Vincular explícitamente el projectId si el service no lo hizo (aunque registerMovement usa referenceId)
    // En nuestro schema tenemos projectId dedicado, así que lo actualizamos.
    await prisma.stockMovement.update({
      where: { id: movement.id },
      data: { projectId }
    });

    return NextResponse.json(movement);
  } catch (error) {
    console.error('Error registering project consumption:', error);
    return NextResponse.json({ error: 'Error al registrar consumo de materiales' }, { status: 500 });
  }
}, ['erp:write']);
