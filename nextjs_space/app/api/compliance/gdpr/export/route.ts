import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { withTenantAuth } from '@/lib/api-key-auth'
import { AuditService } from '@/lib/audit-service'

/**
 * GET /api/compliance/gdpr/export
 * Exporta todos los datos de auditoría del usuario actual (GDPR Right to Access).
 */
export const GET = withTenantAuth(async (req, auth) => {
  try {
    const userId = auth.user!.id
    const tenantId = auth.tenant!.id

    const exportData = await AuditService.getUserDataExport(userId, tenantId)

    // Registrar la exportación GDPR
    await AuditService.log({
      tenantId,
      userId,
      action: 'GDPR_EXPORT_REQUESTED',
      entity: 'User',
      entityId: userId,
      description: 'User requested GDPR data export',
      metadata: { entriesCount: exportData.entries.length },
    })

    return NextResponse.json({
      success: true,
      user: { id: userId, tenantId },
      entries: exportData.entries,
      exportedAt: new Date().toISOString(),
    })
  } catch (error) {
    console.error('[GDPR Export] Error:', error)
    return NextResponse.json(
      { success: false, error: 'Error exporting data' },
      { status: 500 }
    )
  }
})
