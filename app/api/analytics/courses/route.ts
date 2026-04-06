export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getCourseMetrics } from '@/lib/analytics-engine'
import { subDays, startOfDay, endOfDay } from 'date-fns'

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const days = parseInt(searchParams.get('days') || '30')

    const desde = startOfDay(subDays(new Date(), days))
    const hasta = endOfDay(new Date())

    const metrics = await getCourseMetrics({ desde, hasta })

    return NextResponse.json(metrics)
  } catch (error) {
    console.error('Error al obtener métricas de cursos:', error)
    return NextResponse.json(
      { error: 'Error al obtener métricas de cursos' },
      { status: 500 }
    )
  }
}
