export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { withTenantAuth } from '@/lib/api-key-auth';
import {
  getCaptacionById,
  updateCaptacion,
  deleteCaptacion,
  ReferenciaAjenaError,
} from '@/lib/real-estate/captacion-helpers';

/**
 * GET /api/real-estate/captaciones/[id]
 *
 * Obtiene una captación por ID con sus relaciones.
 */
export const GET = withTenantAuth(async (req, auth, { params }) => {
  const tenantId = auth.tenant!.id;
  const { id } = params;

  try {
    const captacion = await getCaptacionById(tenantId, id);

    if (!captacion) {
      return NextResponse.json(
        { error: 'Captación no encontrada' },
        { status: 404 }
      );
    }

    return NextResponse.json(captacion);
  } catch (error) {
    console.error('[Captaciones API] Error getting captacion:', error);
    return NextResponse.json(
      { error: 'Error al obtener la captación' },
      { status: 500 }
    );
  }
});

/**
 * PATCH /api/real-estate/captaciones/[id]
 *
 * Actualiza una captación existente.
 */
export const PATCH = withTenantAuth(async (req, auth, { params }) => {
  const tenantId = auth.tenant!.id;
  const { id } = params;

  try {
    const body = await req.json();

    // Validar fechas si se envían ambas
    if (body.fechaInicio && body.fechaFin) {
      if (new Date(body.fechaFin) <= new Date(body.fechaInicio)) {
        return NextResponse.json(
          { error: 'fechaFin debe ser posterior a fechaInicio' },
          { status: 400 }
        );
      }
    }

    const captacion = await updateCaptacion(tenantId, id, body);

    if (!captacion) {
      return NextResponse.json(
        { error: 'Captación no encontrada' },
        { status: 404 }
      );
    }

    return NextResponse.json(captacion);
  } catch (error) {
    if (error instanceof ReferenciaAjenaError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    console.error('[Captaciones API] Error updating captacion:', error);
    return NextResponse.json(
      { error: 'Error al actualizar la captación' },
      { status: 500 }
    );
  }
});

/**
 * DELETE /api/real-estate/captaciones/[id]
 *
 * Elimina una captación.
 */
export const DELETE = withTenantAuth(async (req, auth, { params }) => {
  const tenantId = auth.tenant!.id;
  const { id } = params;

  try {
    const deleted = await deleteCaptacion(tenantId, id);

    if (!deleted) {
      return NextResponse.json(
        { error: 'Captación no encontrada' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Captaciones API] Error deleting captacion:', error);
    return NextResponse.json(
      { error: 'Error al eliminar la captación' },
      { status: 500 }
    );
  }
});
