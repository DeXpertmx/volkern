export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/api-key-auth';

/**
 * POST /api/catalogo/chatbot-search
 * 
 * Endpoint REST que expone buscarCatalogo para uso desde:
 * - Widget del chatbot (frontend)
 * - MCP (Model Context Protocol)
 * - Automatizaciones y webhooks
 * 
 * Body (JSON):
 * {
 *   query?: string           // Texto libre de búsqueda (usa búsqueda semántica)
 *   tipo?: string            // Tipo de ítem: inmueble, servicio, producto_terminado, etc.
 *   precioMin?: number       // Precio mínimo
 *   precioMax?: number       // Precio máximo
 *   categoria?: string       // Categoría del catálogo
 *   etiqueta?: string        // Etiqueta del catálogo
 *   filtrosCustom?: Record<string, string>  // Filtros por customFieldValues (ej: { ciudad: "Madrid" })
 *   limit?: number           // Máximo de resultados (default 10, max 25)
 * }
 * 
 * Respuesta:
 * {
 *   success: true,
 *   message: string,         // Texto formateado para el chatbot
 *   items: [...],            // Array de resultados estructurados
 *   total: number,
 *   hasMore: boolean
 * }
 */
export async function POST(req: NextRequest) {
  try {
    // Autenticar — acepta permisos de catálogo y chatbot
    const auth = await authenticateRequest(req, ['catalogo:read', 'chatbot:read', 'config:read']);
    if (!auth.valid) {
      return NextResponse.json({ error: auth.error }, { status: 401 });
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Body debe ser un JSON válido' }, { status: 400 });
    }

    const {
      query,
      tipo,
      precioMin,
      precioMax,
      categoria,
      etiqueta,
      filtrosCustom,
      limit,
    } = body;

    // Validar tipos
    if (precioMin !== undefined && typeof precioMin !== 'number') {
      return NextResponse.json({ error: 'precioMin debe ser un número' }, { status: 400 });
    }
    if (precioMax !== undefined && typeof precioMax !== 'number') {
      return NextResponse.json({ error: 'precioMax debe ser un número' }, { status: 400 });
    }
    if (limit !== undefined && (typeof limit !== 'number' || limit < 1 || limit > 50)) {
      return NextResponse.json({ error: 'limit debe ser un número entre 1 y 50' }, { status: 400 });
    }

    // Llamar al skill
    const { skills } = await import('@/lib/skills');
    const result = await skills.buscar_catalogo({
      tenantId: auth.tenant!.id,
      query: query || undefined,
      tipo: tipo || undefined,
      precioMin: precioMin !== undefined ? Number(precioMin) : undefined,
      precioMax: precioMax !== undefined ? Number(precioMax) : undefined,
      categoria: categoria || undefined,
      etiqueta: etiqueta || undefined,
      filtrosCustom: filtrosCustom && Object.keys(filtrosCustom).length > 0 ? filtrosCustom : undefined,
      limit: Math.min(limit || 10, 50),
    });

    if (!result.success) {
      return NextResponse.json(
        { error: 'Error al buscar en el catálogo', details: result },
        { status: 500 }
      );
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('[API] Error en chatbot-search:', error);
    return NextResponse.json(
      { error: 'Error interno al buscar en el catálogo' },
      { status: 500 }
    );
  }
}
