import { NextResponse } from 'next/server'
import { withTenantAuth } from '@/lib/api-key-auth'
import { globalPrisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

/**
 * POST /api/compliance/upgrade
 * Activa Compliance PRO como addon para el tenant.
 * Verifica que el plan base sea Profesional o Infinity.
 */
export const POST = withTenantAuth(async (req, auth) => {
  try {
    const tenantId = auth.tenantId

    // 1. Verificar que el tenant existe
    const tenant = await globalPrisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        id: true,
        plan: true,
        configuracion: true,
      },
    })

    if (!tenant) {
      return NextResponse.json(
        { success: false, error: 'Tenant no encontrado' },
        { status: 404 }
      )
    }

    // 2. Verificar que el plan base es compatible (Profesional o Infinity)
    const plan = tenant.plan?.toLowerCase()
    if (plan !== 'profesional' && plan !== 'infinity') {
      return NextResponse.json(
        {
          success: false,
          error: 'Compliance PRO requiere plan Profesional o Infinity. Actualiza tu plan primero.',
          requiresUpgrade: true,
        },
        { status: 400 }
      )
    }

    // 3. Verificar si ya está activado
    const existingFeature = await globalPrisma.tenantFeature.findUnique({
      where: {
        tenantId_feature: {
          tenantId,
          feature: 'compliance_pro',
        },
      },
    })

    if (existingFeature?.habilitado) {
      return NextResponse.json({
        success: true,
        message: 'Compliance PRO ya está activo',
        alreadyActive: true,
      })
    }

    // 4. Activar Compliance PRO como feature del tenant
    if (existingFeature) {
      await globalPrisma.tenantFeature.update({
        where: {
          tenantId_feature: {
            tenantId,
            feature: 'compliance_pro',
          },
        },
        data: { habilitado: true },
      })
    } else {
      await globalPrisma.tenantFeature.create({
        data: {
          tenantId,
          feature: 'compliance_pro',
          habilitado: true,
        },
      })
    }

    // 5. Habilitar compliance_mode en la config del tenant
    const config = (tenant.configuracion as Record<string, any>) || {}
    config.complianceMode = 'compliance'

    await globalPrisma.tenant.update({
      where: { id: tenantId },
      data: {
        configuracion: config,
      },
    })

    // 6. Registrar en audit log
    const { AuditService } = await import('@/lib/audit-service')
    await AuditService.log({
      tenantId,
      userId: auth.userId,
      action: 'COMPLIANCE_PRO_ACTIVATED',
      entity: 'Tenant',
      entityId: tenantId,
      description: 'Compliance PRO activado como addon',
      metadata: { plan, activatedAt: new Date().toISOString() },
    })

    return NextResponse.json({
      success: true,
      message: 'Compliance PRO activado correctamente',
      alreadyActive: false,
    })
  } catch (error) {
    console.error('[ComplianceUpgrade] Error:', error)
    return NextResponse.json(
      { success: false, error: 'Error activando Compliance PRO' },
      { status: 500 }
    )
  }
})
