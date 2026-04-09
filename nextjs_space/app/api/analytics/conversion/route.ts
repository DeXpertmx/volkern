export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server'
import { withTenantAuth } from '@/lib/api-key-auth'
import { getConversionMetrics } from '@/lib/analytics-engine'
import { subDays, startOfDay, endOfDay } from 'date-fns'

// GET /api/analytics/conversion - Obtener métricas de conversión detalladas para el tenant
export const GET = withTenantAuth(async (request, auth) => {
  try {
    const { searchParams } = new URL(request.url)
    const days = parseInt(searchParams.get('days') || '30')

    const desde = startOfDay(subDays(new Date(), days))
    const hasta = endOfDay(new Date())

    // El proxy de prisma en analytics-engine consultará la base de datos física del tenant
    const metrics = await getConversionMetrics({ desde, hasta })

    return NextResponse.json(metrics)
  } catch (error) {
    console.error('Error al obtener métricas de conversión:', error)
    return NextResponse.json(
      { error: 'Error al obtener métricas de conversión' },
      { status: 500 }
    )
  }
}, ['analytics:read', 'conversion:read'])
