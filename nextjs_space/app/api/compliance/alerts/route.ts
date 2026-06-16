import { NextResponse } from 'next/server'
import { ComplianceAlertsEngine } from '@/lib/compliance-alerts'
import { withTenantAuth } from '@/lib/api-key-auth'

export const dynamic = 'force-dynamic'

/**
 * GET /api/compliance/alerts
 * Detecta y retorna todas las alertas inteligentes de compliance para el tenant.
 */
export const GET = withTenantAuth(async (req, auth) => {
  try {
    const summary = await ComplianceAlertsEngine.detectAll(auth.tenantId)

    return NextResponse.json({ success: true, ...summary })
  } catch (error) {
    console.error('[ComplianceAlerts] Error:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Error detectando alertas inteligentes',
        total: 0,
        critical: 0,
        warning: 0,
        info: 0,
        byCategory: { flujo: 0, acceso: 0, proceso: 0, cambio_critico: 0 },
        alerts: [],
      },
      { status: 500 }
    )
  }
})
