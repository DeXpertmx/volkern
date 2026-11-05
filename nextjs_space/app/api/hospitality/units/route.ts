export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { authenticateRequest } from '@/lib/api-key-auth';
import { exigirPermisoHospitality } from '@/lib/hospitality/permissions';
import { logAuditAction } from '@/lib/permissions';
import { monedaEfectiva, monedaEscritura } from '@/lib/moneda';
import { normalizarDetalleUnidad } from '@/lib/hospitality/unit-detalle';
import { Prisma } from '@prisma/client';

// GET /api/hospitality/units — listar unidades del tenant (filtrable por propiedad)
export async function GET(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req, ['hospitality:read']);
    if (!auth.valid) return NextResponse.json({ error: auth.error }, { status: 401 });
    // La capacidad la decide el rol (§27): sin ella, 403 con el permiso exacto.
    const sinPermiso = exigirPermisoHospitality(auth, 'reservas.ver');
    if (sinPermiso) return sinPermiso;

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

    return NextResponse.json({ units });
  } catch (error) {
    console.error('Error obteniendo unidades:', error);
    return NextResponse.json({ error: 'Error al obtener unidades' }, { status: 500 });
  }
}

// POST /api/hospitality/units — crear unidad
export async function POST(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req, ['hospitality:write']);
    if (!auth.valid) return NextResponse.json({ error: auth.error }, { status: 401 });
    // La capacidad la decide el rol (§27): sin ella, 403 con el permiso exacto.
    const sinPermiso = exigirPermisoHospitality(auth, 'reservas.crear');
    if (sinPermiso) return sinPermiso;

    const data = await req.json();
    const { propertyId, nombre, codigo, tipo, capacidad, estado, tarifaBase, moneda, descripcion, fotos, amenidades, detalleAlojamiento } = data || {};

    if (!propertyId || !nombre?.trim()) {
      return NextResponse.json(
        { error: 'propertyId y nombre son requeridos' },
        { status: 400 }
      );
    }

    // Fotos y amenidades de la unidad: listas saneadas o nada. Las fotos se
    // guardan como URLs sueltas (forma que ya consumen Portada y Booking
    // Engine); un objeto { url } de clientes ricos aporta la URL y nada más.
    const urlsFotos = Array.isArray(fotos)
      ? fotos
          .map((f: unknown) =>
            typeof f === 'string' && f.trim()
              ? f.trim()
              : f && typeof f === 'object' && typeof (f as { url?: unknown }).url === 'string'
                ? (f as { url: string }).url.trim()
                : null
          )
          .filter((u: unknown): u is string => typeof u === 'string' && u.length > 0)
      : undefined;
    const amenidadesSanas = Array.isArray(amenidades)
      ? amenidades.filter((a: unknown): a is string => typeof a === 'string' && a.trim().length > 0)
      : undefined;

    // Detalle declarado de ESTA unidad (habitaciones/camas): se normaliza con
    // el módulo puro — un mapa corrupto no entra en el JSONB. Vacío = sin
    // configurar (columna a null). Forma inválida no toca nada.
    const detalleUnidad =
      detalleAlojamiento && typeof detalleAlojamiento === 'object' && !Array.isArray(detalleAlojamiento)
        ? normalizarDetalleUnidad(detalleAlojamiento)
        : null;

    // Verificar que la propiedad pertenezca al tenant (aislamiento)
    const property = await prisma.hospitalityProperty.findFirst({
      where: { id: propertyId, tenantId: auth.tenant!.id },
    });
    if (!property) {
      return NextResponse.json({ error: 'Propiedad no encontrada' }, { status: 404 });
    }

    // La divisa, en el orden que fija la plataforma: la que pidió el hotel, si
    // no la del inventario que ya existe (un hotel no mezcla divisas por
    // descuido), si no la moneda de reporte del tenant. El valor por defecto del
    // esquema es solo la red de seguridad de la escritura: un tenant español
    // creaba unidades en pesos con solo omitir el campo.
    const monedaPedida = typeof moneda === 'string' && moneda.trim() ? moneda.trim().toUpperCase() : '';
    let monedaDeLaUnidad = monedaPedida;
    if (!monedaDeLaUnidad) {
      const inventario = await prisma.hospitalityUnit.findMany({
        where: { tenantId: auth.tenant!.id },
        select: { moneda: true },
        take: 200,
      });
      monedaDeLaUnidad = monedaEfectiva(inventario.map((u) => u.moneda), auth.tenant!.moneda);
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

    const unit = await prisma.hospitalityUnit.create({
      data: {
        tenantId: auth.tenant!.id,
        propertyId,
        nombre: nombre.trim(),
        codigo: codigo?.trim() || null,
        tipo: tipo || 'apartamento',
        capacidad: parseInt(capacidad) || 2,
        tarifaBase: tarifaBase !== undefined ? parseFloat(tarifaBase) || null : null,
        moneda: monedaEscritura(monedaDeLaUnidad),
        estado: estado || 'available',
        ...(descripcion !== undefined
          ? { descripcion: typeof descripcion === 'string' && descripcion.trim() ? descripcion.trim() : null }
          : {}),
        ...(urlsFotos !== undefined ? { fotos: urlsFotos } : {}),
        ...(amenidadesSanas !== undefined ? { amenidades: amenidadesSanas } : {}),
        ...(detalleUnidad ? { detalleAlojamiento: detalleUnidad as unknown as Prisma.InputJsonValue } : {}),
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