import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withTenantAuth } from '@/lib/api-key-auth';

/**
 * GET /api/erp/warehouses - Listar almacenes del tenant
 */
export const GET = withTenantAuth(async (request, auth) => {
  try {
    const warehouses = await prisma.warehouse.findMany({
      where: {
        tenantId: auth.tenant!.id,
        active: true
      },
      orderBy: { name: 'asc' }
    });

    return NextResponse.json(warehouses);
  } catch (error) {
    console.error('Error fetching warehouses:', error);
    return NextResponse.json({ error: 'Error al cargar almacenes' }, { status: 500 });
  }
}, ['erp:read']);

/**
 * POST /api/erp/warehouses - Crear un nuevo almacén
 */
export const POST = withTenantAuth(async (request, auth) => {
  try {
    const body = await request.json();
    
    if (!body.name) {
      return NextResponse.json({ error: 'El nombre es obligatorio' }, { status: 400 });
    }

    const warehouse = await prisma.warehouse.create({
      data: {
        tenantId: auth.tenant!.id,
        name: body.name,
        location: body.location,
        description: body.description
      }
    });

    return NextResponse.json(warehouse);
  } catch (error) {
    console.error('Error creating warehouse:', error);
    return NextResponse.json({ error: 'Error al crear almacén' }, { status: 500 });
  }
}, ['erp:write']);
