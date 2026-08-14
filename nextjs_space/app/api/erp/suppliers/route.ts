export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withTenantAuth } from '@/lib/api-key-auth';

/**
 * GET /api/erp/suppliers - Listar proveedores del tenant
 */
export const GET = withTenantAuth(async (request, auth) => {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search');

    const where: any = {
      tenantId: auth.tenant!.id,
      active: true
    };

    if (search) {
      where.name = { contains: search, mode: 'insensitive' };
    }

    const suppliers = await prisma.supplier.findMany({
      where,
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

    // vatRates: tipos de IVA que aplica el proveedor (p. ej. [21, 10, 4])
    const vatRates = Array.isArray(body.vatRates)
      ? body.vatRates
          .map((v: unknown) => Number(v))
          .filter((v: number) => Number.isFinite(v) && v >= 0)
      : [];

    // Trato fiscal: régimen legal + porcentajes de retención (IRPF/IVA)
    const fiscalRegime = typeof body.fiscalRegime === 'string' ? body.fiscalRegime : 'EMPRESA';
    const irpfN = Number(body.irpfRetention);
    const ivaN = Number(body.ivaRetention);
    const irpfRetention = Number.isFinite(irpfN) && irpfN >= 0 ? irpfN : 0;
    const ivaRetention = Number.isFinite(ivaN) && ivaN >= 0 ? ivaN : 0;

    const supplier = await prisma.supplier.create({
      data: {
        tenantId: auth.tenant!.id,
        name: body.name,
        taxId: body.taxId,
        vatRates,
        fiscalRegime,
        irpfRetention,
        ivaRetention,
        email: body.email,
        phone: body.phone,
        streetType: body.streetType,
        streetName: body.streetName,
        streetNumber: body.streetNumber,
        staircase: body.staircase,
        floor: body.floor,
        door: body.door,
        postalCode: body.postalCode,
        city: body.city,
        province: body.province,
        country: body.country,
        category: body.category || 'Varios'
      }
    });

    return NextResponse.json(supplier);
  } catch (error) {
    console.error('Error creating supplier:', error);
    return NextResponse.json({ error: 'Error al crear proveedor' }, { status: 500 });
  }
}, ['erp:write']);
