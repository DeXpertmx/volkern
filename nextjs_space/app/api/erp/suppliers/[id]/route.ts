export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withTenantAuth } from '@/lib/api-key-auth';

/**
 * PATCH /api/erp/suppliers/[id] - Actualizar un proveedor (incl. tipos de IVA)
 */
export const PATCH = withTenantAuth(async (request, auth, { params }) => {
  try {
    const body = await request.json();

    const supplier = await prisma.supplier.findFirst({
      where: { id: params.id, tenantId: auth.tenant!.id },
    });

    if (!supplier) {
      return NextResponse.json({ error: 'Proveedor no encontrado' }, { status: 404 });
    }

    const data: Record<string, unknown> = {};
    const campos: Array<[string, string]> = [
      ['name', 'name'], ['taxId', 'taxId'], ['email', 'email'], ['phone', 'phone'],
      ['streetType', 'streetType'], ['streetName', 'streetName'], ['streetNumber', 'streetNumber'],
      ['staircase', 'staircase'], ['floor', 'floor'], ['door', 'door'],
      ['postalCode', 'postalCode'], ['city', 'city'], ['province', 'province'],
      ['country', 'country'], ['category', 'category'],
    ];
    for (const [api, col] of campos) {
      if (body[api] !== undefined) data[col] = body[api];
    }

    if (body.vatRates !== undefined) {
      data.vatRates = Array.isArray(body.vatRates)
        ? body.vatRates
            .map((v: unknown) => Number(v))
            .filter((v: number) => Number.isFinite(v) && v >= 0)
        : [];
    }

    const updated = await prisma.supplier.update({
      where: { id: params.id },
      data,
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error('Error al actualizar proveedor:', error);
    return NextResponse.json({ error: 'Error al actualizar proveedor' }, { status: 500 });
  }
}, ['erp:write']);

/**
 * DELETE /api/erp/suppliers/[id] - Eliminar un proveedor
 */
export const DELETE = withTenantAuth(async (request, auth, { params }) => {
  try {
    const supplier = await prisma.supplier.findFirst({
      where: { id: params.id, tenantId: auth.tenant!.id },
      include: { _count: { select: { expenses: true } } },
    });

    if (!supplier) {
      return NextResponse.json({ error: 'Proveedor no encontrado' }, { status: 404 });
    }

    if (supplier._count.expenses > 0) {
      return NextResponse.json(
        { error: 'No se puede eliminar un proveedor con gastos asociados' },
        { status: 400 }
      );
    }

    await prisma.supplier.delete({ where: { id: params.id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error al eliminar proveedor:', error);
    return NextResponse.json({ error: 'Error al eliminar proveedor' }, { status: 500 });
  }
}, ['erp:write']);
