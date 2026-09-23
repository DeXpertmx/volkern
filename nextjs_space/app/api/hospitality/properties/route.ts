export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { authenticateRequest } from '@/lib/api-key-auth';
import { exigirPermisoHospitality } from '@/lib/hospitality/permissions';
import { monedaEscritura } from '@/lib/moneda';
import { logAuditAction } from '@/lib/permissions';
import { politicaEfectiva } from '@/lib/hospitality/no-show';
import { politicaSalidaAnticipadaEfectiva } from '@/lib/hospitality/checkout';
import { holdHorasEfectivas } from '@/lib/hospitality/holds';

// GET /api/hospitality/properties — listar propiedades del tenant
export async function GET(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth.valid) return NextResponse.json({ error: auth.error }, { status: 401 });
    // La capacidad la decide el rol (§27): sin ella, 403 con el permiso exacto.
    const sinPermiso = exigirPermisoHospitality(auth, 'reservas.ver');
    if (sinPermiso) return sinPermiso;

    const { searchParams } = new URL(req.url);
    const estado = searchParams.get('estado');
    const search = searchParams.get('search');
    const includeUnits = searchParams.get('includeUnits') === 'true';

    const where: any = { tenantId: auth.tenant!.id };
    if (estado) where.estado = estado;
    if (search) {
      where.OR = [
        { nombre: { contains: search, mode: 'insensitive' } },
        { ciudad: { contains: search, mode: 'insensitive' } },
        { pais: { contains: search, mode: 'insensitive' } },
      ];
    }

    const properties = await prisma.hospitalityProperty.findMany({
      where,
      include: includeUnits ? { units: true, _count: { select: { units: true, reservations: true } } } : { _count: { select: { units: true, reservations: true } } },
      orderBy: { fechaCreacion: 'desc' },
    });

    return NextResponse.json({ properties });
  } catch (error) {
    console.error('Error obteniendo propiedades:', error);
    return NextResponse.json({ error: 'Error al obtener propiedades' }, { status: 500 });
  }
}

// POST /api/hospitality/properties — crear propiedad
export async function POST(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth.valid) return NextResponse.json({ error: auth.error }, { status: 401 });
    // La capacidad la decide el rol (§27): sin ella, 403 con el permiso exacto.
    const sinPermiso = exigirPermisoHospitality(auth, 'reservas.crear');
    if (sinPermiso) return sinPermiso;

    const data = await req.json();
    const {
      nombre, descripcion, codigo, zona, direccion, ciudad, estadoProvincia,
      pais, cp, latitud, longitud, fotos, timezone, estado, unidades, politicaNoShow,
      politicaSalidaAnticipada, holdHoras,
    } = data || {};

    if (!nombre || !nombre.trim()) {
      return NextResponse.json({ error: 'El nombre es requerido' }, { status: 400 });
    }

    const property = await prisma.hospitalityProperty.create({
      data: {
        tenantId: auth.tenant!.id,
        nombre: nombre.trim(),
        descripcion: descripcion || null,
        codigo: codigo || null,
        zona: zona || null,
        direccion: direccion || null,
        ciudad: ciudad || null,
        estadoProvincia: estadoProvincia || null,
        pais: pais || null,
        cp: cp || null,
        latitud: latitud != null && latitud !== '' ? Number(latitud) : null,
        longitud: longitud != null && longitud !== '' ? Number(longitud) : null,
        fotos: Array.isArray(fotos) ? (fotos as Prisma.InputJsonValue[]) : Prisma.DbNull,
        timezone: timezone || 'America/Mexico_City',
        estado: estado || 'activa',
        // Política de penalización por no-show. Un valor inválido cae en la de
        // defecto en vez de guardarse y cambiar el criterio en silencio.
        politicaNoShow: politicaEfectiva(politicaNoShow),
        // Apagador de salida anticipada (A/B). Un valor inválido cae en el
        // defecto (B) en vez de guardarse y cambiar el criterio en silencio.
        politicaSalidaAnticipada: politicaSalidaAnticipadaEfectiva(politicaSalidaAnticipada),
        // Ventana de caducidad de los holds `pending` (0 = sin caducidad).
        // Un valor inválido cae en el defecto (24 h).
        holdHoras: holdHorasEfectivas(holdHoras),
      },
    });

    // Alta rápida de unidades iniciales (opcional, en la misma creación).
    if (Array.isArray(unidades) && unidades.length > 0) {
      await prisma.hospitalityUnit.createMany({
        data: unidades.slice(0, 50).map((u: any) => ({
          tenantId: auth.tenant!.id,
          propertyId: property.id,
          nombre: String(u.nombre || '').trim() || 'Unidad',
          codigo: u.codigo || null,
          tipo: u.tipo || 'apartamento',
          capacidad: Number(u.capacidad) || 2,
          tarifaBase: u.tarifaBase != null && u.tarifaBase !== '' ? Number(u.tarifaBase) : null,
          // Divisa de cada unidad del alta: la indicada, si no la del tenant.
          moneda: monedaEscritura(u.moneda, auth.tenant!.moneda),
        })),
      });
    }

    // Auditoría
    await logAuditAction(
      auth.user!.id,
      auth.tenant!.id,
      'crear',
      'hospitality_property',
      property.id,
      `Propiedad "${property.nombre}" creada`
    ).catch(() => {});

    return NextResponse.json(property, { status: 201 });
  } catch (error) {
    console.error('Error creando propiedad:', error);
    return NextResponse.json({ error: 'Error al crear propiedad' }, { status: 500 });
  }
}