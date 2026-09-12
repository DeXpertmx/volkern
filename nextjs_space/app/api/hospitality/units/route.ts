export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { authenticateRequest } from '@/lib/api-key-auth';
import { logAuditAction } from '@/lib/permissions';
import { monedaEscritura, monedaPredominante } from '@/lib/hospitality/moneda';

// GET /api/hospitality/units — listar unidades del tenant (filtrable por propiedad)
export async function GET(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth.valid) return NextResponse.json({ error: auth.error }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const propertyId = searchParams.get('propertyId');
    const estado = searchParams.get('estado');
    const search = searchParams.get('search');

    const where: any = { tenantId: auth.tenant!.id };
    if (propertyId) where.propertyId = propertyId;
    if (estado) where.estado = estado;
    if (search) {
      where.OR = [
        { nombre: { contains: search, mode: 'insensitive' } },
        { codigo: { contains: search, mode: 'insensitive' } },
      ];
    }

    const units = await prisma.hospitalityUnit.findMany({
      where,
      include: {
        property: { select: { id: true, nombre: true } },
        _count: { select: { reservations: true } },
      },
      orderBy: [{ propertyId: 'asc' }, { nombre: 'asc' }],
    });

    // La divisa del tenant viaja con la lista para que la vista la use de respaldo
    // cuando no haya datos de los que deducirla.
    return NextResponse.json({ units, moneda: auth.tenant!.moneda ?? null });
  } catch (error) {
    console.error('Error obteniendo unidades:', error);
    return NextResponse.json({ error: 'Error al obtener unidades' }, { status: 500 });
  }
}

// POST /api/hospitality/units — crear unidad
export async function POST(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth.valid) return NextResponse.json({ error: auth.error }, { status: 401 });

    const data = await req.json();
    const { propertyId, nombre, codigo, tipo, capacidad, estado, tarifaBase, moneda } = data || {};

    if (!propertyId || !nombre?.trim()) {
      return NextResponse.json(
        { error: 'propertyId y nombre son requeridos' },
        { status: 400 }
      );
    }

    // Verificar que la propiedad pertenezca al tenant (aislamiento)
    const property = await prisma.hospitalityProperty.findFirst({
      where: { id: propertyId, tenantId: auth.tenant!.id },
    });
    if (!property) {
      return NextResponse.json({ error: 'Propiedad no encontrada' }, { status: 404 });
    }

    // Código único por tenant (si se proporciona)
    if (codigo) {
      const dup = await prisma.hospitalityUnit.findFirst({
        where: { tenantId: auth.tenant!.id, codigo },
      });
      if (dup) {
        return NextResponse.json({ error: 'Ya existe una unidad con ese código' }, { status: 400 });
      }
    }

    // La divisa de una unidad nueva se resuelve así: lo que mande el cliente, si
    // no, la que ya usa el inventario del tenant, y si el tenant aún no tiene
    // unidades, su moneda de reporte. El valor por defecto del esquema ('MXN')
    // no participa: es el último recurso de la base de datos, no una decisión del
    // negocio, y usarlo como respaldo dejaba a una cuenta europea en pesos.
    const monedaExplicita = moneda ? String(moneda).toUpperCase().trim() : '';
    let monedaUnidad = monedaExplicita;
    if (!monedaUnidad) {
      const existentes = await prisma.hospitalityUnit.findMany({
        where: { tenantId: auth.tenant!.id },
        select: { moneda: true },
      });
      // `monedaEscritura` añade la red de seguridad de las escrituras: la columna
      // no admite nulos. En producción `Tenant.moneda` siempre trae valor.
      monedaUnidad = monedaEscritura(
        monedaPredominante(existentes.map((u) => u.moneda)),
        auth.tenant!.moneda
      );
    }

    const unit = await prisma.hospitalityUnit.create({
      data: {
        tenantId: auth.tenant!.id,
        propertyId,
        nombre: nombre.trim(),
        codigo: codigo?.trim() || null,
        tipo: tipo || 'apartamento',
        capacidad: parseInt(capacidad) || 2,
        tarifaBase: tarifaBase !== undefined ? parseFloat(tarifaBase) || null : null,
        moneda: monedaUnidad,
        estado: estado || 'available',
      },
      include: { property: { select: { id: true, nombre: true } } },
    });

    await logAuditAction(
      auth.user!.id,
      auth.tenant!.id,
      'crear',
      'hospitality_unit',
      unit.id,
      `Unidad "${unit.nombre}" creada en "${property.nombre}"`
    ).catch(() => {});

    return NextResponse.json({ unit }, { status: 201 });
  } catch (error) {
    console.error('Error creando unidad:', error);
    return NextResponse.json({ error: 'Error al crear unidad' }, { status: 500 });
  }
}