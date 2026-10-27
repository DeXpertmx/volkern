export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { withTenantAuth } from '@/lib/api-key-auth';
import {
  listCaptaciones,
  createCaptacion,
  getCaptacionStats,
  ReferenciaAjenaError,
  type CaptacionEstado,
  type CaptacionTipo,
} from '@/lib/real-estate/captacion-helpers';

/**
 * GET /api/real-estate/captaciones
 *
 * Lista paginada de captaciones con filtros.
 *
 * Query params: ?estado, ?tipoCaptacion, ?propiedadId, ?contactoPropietarioId,
 *               ?creadoPor, ?desde, ?hasta, ?search, ?limit, ?offset
 */
export const GET = withTenantAuth(async (req, auth) => {
  const tenantId = auth.tenant!.id;
  const { searchParams } = new URL(req.url);

  const getStats = searchParams.get('stats') === 'true';

  try {
    if (getStats) {
      const stats = await getCaptacionStats(tenantId);
      return NextResponse.json({ stats });
    }

    const filters = {
      estado: (searchParams.get('estado') as CaptacionEstado) || undefined,
      tipoCaptacion: (searchParams.get('tipoCaptacion') as CaptacionTipo) || undefined,
      propiedadId: searchParams.get('propiedadId') || undefined,
      contactoPropietarioId: searchParams.get('contactoPropietarioId') || undefined,
      creadoPor: searchParams.get('creadoPor') || undefined,
      desde: searchParams.get('desde') || undefined,
      hasta: searchParams.get('hasta') || undefined,
      search: searchParams.get('search') || undefined,
      limit: Math.min(parseInt(searchParams.get('limit') || '20'), 100),
      offset: parseInt(searchParams.get('offset') || '0'),
    };

    const result = await listCaptaciones(tenantId, filters);

    return NextResponse.json({
      captaciones: result.captaciones,
      pagination: {
        limit: filters.limit,
        offset: filters.offset,
        total: result.total,
        totalPages: Math.ceil(result.total / filters.limit),
        currentPage: Math.floor(filters.offset / filters.limit) + 1,
      },
    });
  } catch (error) {
    console.error('[Captaciones API] Error listing:', error);
    return NextResponse.json(
      { error: 'Error al obtener captaciones' },
      { status: 500 }
    );
  }
});

/**
 * POST /api/real-estate/captaciones
 *
 * Crea una nueva captación (contrato de exclusividad/comisión).
 */
export const POST = withTenantAuth(async (req, auth) => {
  const tenantId = auth.tenant!.id;
  const usuarioId = auth.user!.id;

  try {
    const body = await req.json();

    // Validaciones básicas
    if (!body.fechaInicio || !body.fechaFin) {
      return NextResponse.json(
        { error: 'fechaInicio y fechaFin son requeridos' },
        { status: 400 }
      );
    }

    if (!body.tipoCaptacion) {
      return NextResponse.json(
        { error: 'tipoCaptacion es requerido (exclusiva, compartida, mandato)' },
        { status: 400 }
      );
    }

    if (new Date(body.fechaFin) <= new Date(body.fechaInicio)) {
      return NextResponse.json(
        { error: 'fechaFin debe ser posterior a fechaInicio' },
        { status: 400 }
      );
    }

    const captacion = await createCaptacion(tenantId, usuarioId, body);

    return NextResponse.json(captacion, { status: 201 });
  } catch (error) {
    if (error instanceof ReferenciaAjenaError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    console.error('[Captaciones API] Error creating:', error);
    return NextResponse.json(
      { error: 'Error al crear la captación' },
      { status: 500 }
    );
  }
});
