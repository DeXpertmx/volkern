export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server'
import { withTenantAuth } from '@/lib/api-key-auth'
import { getGeneralDashboardMetrics } from '@/lib/analytics-engine'

// GET /api/analytics/dashboard - Obtener métricas generales del dashboard para el tenant actual
export const GET = withTenantAuth(async (request, auth) => {
  try {
    // El tenant context ya está establecido por withTenantAuth.
    // getGeneralDashboardMetrics usa el Intelligent Proxy de prisma, 
    // por lo que consultará automáticamente la base de datos física del tenant.
    const metrics = await getGeneralDashboardMetrics()

    return NextResponse.json(metrics)
  } catch (error) {
    console.error('Error al obtener métricas del dashboard:', error)
    return NextResponse.json(
      { error: 'Error al obtener métricas del dashboard' },
      { status: 500 }
    )
  }
}, ['analytics:read', 'dashboard:read'])
