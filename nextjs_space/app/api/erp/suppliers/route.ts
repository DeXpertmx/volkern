import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withTenantAuth } from '@/lib/api-key-auth';

/**
 * GET /api/erp/suppliers - Listar proveedores del tenant
 */
export const GET = withTenantAuth(async (request, auth) => {
  try {
    const suppliers = await prisma.supplier.findMany({
      where: {
        tenantId: auth.tenant!.id,
        active: true
      },
      orderBy: { name: 'asc' }
    });

    return NextResponse.json(suppliers);
  } catch (error) {
    console.error('Error fetching suppliers:', error);
    return NextResponse.json({ error: 'Error al cargar proveedores' }, { status: 500 });
  }
}, ['erp:read']);

/**
 * POST /api/erp/suppliers - Crear un nuevo proveedor
 */
export const POST = withTenantAuth(async (request, auth) => {
  try {
    const body = await request.json();
    
    if (!body.name) {
      return NextResponse.json({ error: 'El nombre es obligatorio' }, { status: 400 });
    }

    const supplier = await prisma.supplier.create({
      data: {
        tenantId: auth.tenant!.id,
        name: body.name,
        taxId: body.taxId,
        email: body.email,
        phone: body.phone,
        category: body.category || 'Varios'
      }
    });

    return NextResponse.json(supplier);
  } catch (error) {
    console.error('Error creating supplier:', error);
    return NextResponse.json({ error: 'Error al crear proveedor' }, { status: 500 });
  }
}, ['erp:write']);
