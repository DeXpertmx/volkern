export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { parseInmueble } from '@/lib/real-estate/property-helpers';
import type { CatalogoItem } from '@prisma/client';

/**
 * GET /api/public/real-estate/propiedades?tenantId=XXX
 *
 * Endpoint público (sin sesión) que devuelve las propiedades activas de un
 * tenant para uso en embebidos de terceros (widget de inmuebles).
 *
 * Solo devuelve inmuebles con `activo: true` y `tipo: 'inmueble'`.
 */
export const GET = async (req: NextRequest) => {
  const { searchParams } = new URL(req.url);
  const tenantId = searchParams.get('tenantId');

  if (!tenantId || typeof tenantId !== 'string') {
    return NextResponse.json(
      { error: 'tenantId es requerido' },
      { status: 400 }
    );
  }

  // Validar que el tenant exista y esté activo
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true, nombre: true, slug: true, estado: true, plan: true },
  });

  if (!tenant) {
    return NextResponse.json(
      { error: 'Tenant no encontrado' },
      { status: 404 }
    );
  }

  if (tenant.estado !== 'activo') {
    return NextResponse.json(
      { error: 'Tenant no activo' },
      { status: 403 }
    );
  }

  const limite = Math.min(
    parseInt(searchParams.get('limite') || '50', 10),
    100
  );
  const offset = parseInt(searchParams.get('offset') || '0', 10);
  const soloDestacadas = searchParams.get('destacadas') === 'true';
  const operacion = searchParams.get('operacion') || undefined;
  const ciudad = searchParams.get('ciudad') || undefined;
  const estado = searchParams.get('estado') || 'disponible';

  try {
    const where: any = {
      tenantId,
      tipo: 'inmueble',
      activo: true,
    };

    if (soloDestacadas) where.destacado = true;
    if (operacion) where.customFieldValues = { path: ['tipo_operacion'], equals: operacion };
    if (ciudad) where.customFieldValues = { path: ['zona'], contains: ciudad, mode: 'insensitive' };
    if (estado) where.customFieldValues = { path: ['estado'], equals: estado };

    const items = await prisma.catalogoItem.findMany({
      where,
      orderBy: [
        { destacado: 'desc' },
        { fechaCreacion: 'desc' },
      ],
      skip: offset,
      take: limite,
    });

    const total = await prisma.catalogoItem.count({ where });

    const properties = (items as unknown as CatalogoItem[]).map(parseInmueble);

    return NextResponse.json({
      ok: true,
      tenant: {
        id: tenant.id,
        nombre: tenant.nombre,
        slug: tenant.slug,
      },
      properties,
      pagination: {
        limit: limite,
        offset,
        total,
        totalPages: Math.ceil(total / limite),
        currentPage: Math.floor(offset / limite) + 1,
      },
    });
  } catch (error) {
    console.error('[Public Real Estate API] Error:', error);
    return NextResponse.json(
      { error: 'Error al obtener propiedades' },
      { status: 500 }
    );
  }
};
