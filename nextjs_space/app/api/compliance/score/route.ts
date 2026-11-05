import { NextResponse } from 'next/server'
import { ComplianceScoreService } from '@/lib/compliance-score'
import { withTenantAuth } from '@/lib/api-key-auth'

export const GET = withTenantAuth(async (req, auth) => {
  try {
    // `withTenantAuth` garantiza `auth.valid === true` antes de invocar el
    // handler, y populate `tenant`/`user` en todos los branches (sesión, JWT,
    // API key). Por eso `!.id` es seguro aquí.
    const tenantId = auth.tenant!.id
    const userId = auth.user!.id

    const report = await ComplianceScoreService.calculate(tenantId)

    // Persistir el score para tracking de tendencia
    await ComplianceScoreService.persistScore(tenantId, userId, report.overall)

    return NextResponse.json({ success: true, report })
  } catch (error) {
    console.error('[ComplianceScore] Error:', error)
    return NextResponse.json(
      { success: false, error: 'Error calculando score de compliance' },
      { status: 500 }
    )
  }
}, ['compliance:read'])
