import { NextResponse } from 'next/server'
import { ComplianceScoreService } from '@/lib/compliance-score'
import { withTenantAuth } from '@/lib/api-key-auth'

export const GET = withTenantAuth(async (req, auth) => {
  try {
    const report = await ComplianceScoreService.calculate(auth.tenantId)

    // Persistir el score para tracking de tendencia
    await ComplianceScoreService.persistScore(auth.tenantId, auth.userId, report.overall)

    return NextResponse.json({ success: true, report })
  } catch (error) {
    console.error('[ComplianceScore] Error:', error)
    return NextResponse.json(
      { success: false, error: 'Error calculando score de compliance' },
      { status: 500 }
    )
  }
})
