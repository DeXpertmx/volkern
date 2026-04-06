export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getCohortAnalysisMetrics } from '@/lib/analytics-engine'

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const metrics = await getCohortAnalysisMetrics()

    return NextResponse.json(metrics)
  } catch (error) {
    console.error('Error al obtener métricas de cohortes:', error)
    return NextResponse.json(
      { error: 'Error al obtener métricas de cohortes' },
      { status: 500 }
    )
  }
}
