import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { withTenantAuth } from '@/lib/api-key-auth'
import { AuditService } from '@/lib/audit-service'

/**
 * POST /api/compliance/gdpr/anonymize
 * Anonimiza los datos de auditoría del usuario actual (GDPR Right to be Forgotten).
 * Requiere confirmación escrita como medida de seguridad.
 */
export const POST = withTenantAuth(async (req, auth) => {
  try {
    const userId = auth.userId
    const tenantId = auth.tenantId
    const body = await req.json().catch(() => ({}))
    const { confirmation } = body

    if (!confirmation || confirmation.trim().length < 10) {
      return NextResponse.json(
        {
          success: false,
          error: 'Se requiere una confirmación escrita de al menos 10 caracteres',
        },
        { status: 400 }
      )
    }

    // Verificar que el usuario existe y es el mismo
    const user = await prisma.user.findUnique({
      where: { id: userId, tenantId },
      select: { id: true, name: true, email: true },
    })

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Usuario no encontrado' },
        { status: 404 }
      )
    }

    const result = await AuditService.anonymizeUserData(userId, tenantId)

    // Registrar la anonimización
    await AuditService.log({
      tenantId,
      userId,
      action: 'GDPR_ANONYMIZE_REQUESTED',
      entity: 'User',
      entityId: userId,
      description: `User requested data anonymization (Right to be Forgotten): ${confirmation}`,
      metadata: {
        anonymizedCount: result.anonymizedCount,
        userEmail: user.email,
        confirmation: confirmation.substring(0, 50),
      },
    })

    return NextResponse.json({
      success: true,
      message: 'Tus datos de auditoría han sido anonimizados correctamente',
      anonymizedCount: result.anonymizedCount,
    })
  } catch (error) {
    console.error('[GDPR Anonymize] Error:', error)
    return NextResponse.json(
      { success: false, error: 'Error al anonimizar datos' },
      { status: 500 }
    )
  }
})
