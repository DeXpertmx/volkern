export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { authenticateRequest } from '@/lib/api-key-auth';
import { logAuditAction } from '@/lib/permissions';

// GET /api/hospitality/properties — listar propiedades del tenant
export async function GET(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth.valid) return NextResponse.json({ error: auth.error }, { status: 401 });

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

    const data = await req.json();
    const { nombre, direccion, ciudad, pais, timezone, estado } = data || {};

    if (!nombre || !nombre.trim()) {
      return NextResponse.json({ error: 'El nombre es requerido' }, { status: 400 });
    }

    const property = await prisma.hospitalityProperty.create({
      data: {
        tenantId: auth.tenant!.id,
        nombre: nombre.trim(),
        direccion: direccion || null,
        ciudad: ciudad || null,
        pais: pais || null,
        timezone: timezone || 'America/Mexico_City',
        estado: estado || 'activa',
      },
    });

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