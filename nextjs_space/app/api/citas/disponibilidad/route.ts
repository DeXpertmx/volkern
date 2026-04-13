export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server'
import { authenticateRequest } from '@/lib/api-key-auth'
import { checkAvailability } from '@/lib/services/appointments'

/**
 * Endpoint estilo Google Calendar para consultar disponibilidad
 * GET /api/citas/disponibilidad?fecha=2025-12-05&duracion=60
 */
export async function GET(request: NextRequest) {
  try {
    // Autenticación dual: sesión o API key
    const auth = await authenticateRequest(request, ['citas:read'])
    
    if (!auth.valid || !auth.tenant) {
      return NextResponse.json(
        { error: auth.error || 'No autorizado' },
        { status: 401 }
      )
    }

    const { searchParams } = new URL(request.url)
    const fecha = searchParams.get('fecha') // YYYY-MM-DD
    const duracionParam = searchParams.get('duracion') || '60'
    const duracion = parseInt(duracionParam, 10)
    const buffer = parseInt(searchParams.get('buffer') || '0', 10)
    const avisoMinimo = parseInt(searchParams.get('avisoMinimo') || '0', 10)

    // Validación
    if (!fecha) {
      return NextResponse.json(
        { 
          error: 'Parámetro "fecha" requerido',
          hint: 'Formato: YYYY-MM-DD, ejemplo: 2025-12-05'
        },
        { status: 400 }
      )
    }

    // Usar el nuevo servicio centralizado
    const availability = await checkAvailability({
      tenantId: auth.tenant.id,
      fecha,
      duracion,
      buffer,
      avisoMinimo
    });

    return NextResponse.json({
      fecha,
      duracion,
      dia: availability.dia,
      diaActivo: availability.disponible || availability.totalSlots > 0,
      disponibles: {
        total: availability.slots.length,
        slots: availability.slots
      },
      recomendacion: availability.disponible 
        ? `Hay ${availability.slots.length} horarios disponibles.` 
        : 'No hay horarios disponibles para este día.'
    })

  } catch (error: any) {
    console.error('[GET /api/citas/disponibilidad] Error:', error)
    return NextResponse.json(
      { 
        error: 'Error al consultar disponibilidad',
        details: error?.message || 'Error desconocido'
      },
      { status: 500 }
    )
  }
}
