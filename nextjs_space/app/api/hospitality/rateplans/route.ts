export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { authenticateRequest } from '@/lib/api-key-auth';
import { exigirPermisoHospitality } from '@/lib/hospitality/permissions';
import { monedaEscritura } from '@/lib/moneda';

/**
 * Planes de tarifa y restricciones de venta (plan maestro §6, §15).
 *
 * GET  /api/hospitality/rateplans?propertyId=&unitId=&activo=
 * POST /api/hospitality/rateplans — crear un plan (dispara el push de tarifas)
 *
 * Un plan pertenece SIEMPRE a una unidad (y a su propiedad). `codigo` es el
 * rateplanCode externo solo si hay mapping; nunca es la identidad interna.
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth.valid) return NextResponse.json({ error: auth.error }, { status: 401 });
    const sinPermiso = exigirPermisoHospitality(auth, 'reservas.ver');
    if (sinPermiso) return sinPermiso;

    const { searchParams } = new URL(req.url);
    const propertyId = searchParams.get('propertyId') || undefined;
    const unitId = searchParams.get('unitId') || undefined;
    const soloActivos = searchParams.get('activo') === 'true';

    const where: any = { tenantId: auth.tenant!.id };
    if (propertyId) where.propertyId = propertyId;
    if (unitId) where.unitId = unitId;
    if (soloActivos) where.activo = true;

    const plans = await prisma.hospitalityRatePlan.findMany({
      where,
      include: {
        unit: { select: { id: true, nombre: true, codigo: true } },
        property: { select: { id: true, nombre: true } },
      },
      orderBy: [{ propertyId: 'asc' }, { unitId: 'asc' }, { nombre: 'asc' }],
    });

    return NextResponse.json({
      ratePlans: plans,
      total: plans.length,
      moneda: auth.tenant!.moneda ?? null,
    });
  } catch (error) {
    console.error('Error obteniendo planes tarifarios:', error);
    return NextResponse.json({ error: 'Error al obtener los planes tarifarios' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth.valid) return NextResponse.json({ error: auth.error }, { status: 401 });
    const sinPermiso = exigirPermisoHospitality(auth, 'reservas.crear');
    if (sinPermiso) return sinPermiso;

    const tenantId = auth.tenant!.id;
    const body = await req.json().catch(() => ({}));
    const { propertyId, unitId, nombre, codigo, tarifa, moneda, minNoches, maxNoches, checkInDias, checkOutDias, activo } = body;

    if (!propertyId || !unitId || !nombre || tarifa == null) {
      return NextResponse.json(
        { error: 'propertyId, unitId, nombre y tarifa son obligatorios' },
        { status: 400 }
      );
    }
    if (typeof tarifa !== 'number' || tarifa <= 0) {
      return NextResponse.json({ error: 'La tarifa debe ser un número mayor a 0' }, { status: 400 });
    }

    // La unidad debe existir y pertenecer al tenant (aislamiento multi-tenant).
    const unit = await prisma.hospitalityUnit.findFirst({
      where: { id: unitId, tenantId, propertyId },
      select: { id: true, moneda: true },
    });
    if (!unit) {
      return NextResponse.json({ error: 'La unidad no existe en este tenant' }, { status: 404 });
    }

    const plan = await prisma.hospitalityRatePlan.create({
      data: {
        tenantId,
        propertyId,
        unitId,
        nombre: String(nombre).trim(),
        codigo: codigo ? String(codigo).trim() : null,
        tarifa,
        // El plan hereda la divisa de su unidad y, si la unidad no tiene, la del
        // tenant; la red de seguridad de la escritura vive en el módulo.
        moneda: monedaEscritura(moneda, unit.moneda, auth.tenant!.moneda),
        minNoches: Math.max(1, parseInt(minNoches) || 1),
        maxNoches: maxNoches != null ? parseInt(maxNoches) : null,
        checkInDias: Array.isArray(checkInDias) && checkInDias.length ? checkInDias : Prisma.JsonNull,
        checkOutDias: Array.isArray(checkOutDias) && checkOutDias.length ? checkOutDias : Prisma.JsonNull,
        activo: activo !== false,
      },
    });

    // Push de tarifas hacia la capa de conectividad (upsert, no bloquea).
    const { dispatchConnectivityPush } = await import('@/lib/hospitality/sync');
    dispatchConnectivityPush(tenantId, propertyId, 'manual', { diasHorizonte: 180 })
      .catch((e: unknown) => console.error('[Hospitality] Push de tarifas falló:', e));

    return NextResponse.json({ ratePlan: plan }, { status: 201 });
  } catch (error) {
    console.error('Error creando plan tarifario:', error);
    return NextResponse.json({ error: 'Error al crear el plan tarifario' }, { status: 500 });
  }
}