export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { withTenantAuth } from '@/lib/api-key-auth'
import { automationService } from '@/lib/automation-service'

export const POST = withTenantAuth(async (req, auth) => {
  try {
    const tenantId = auth.tenant!.id
    const user = auth.user!

    const result = await automationService.syncWorkflowsFromN8n(tenantId)

    await prisma.auditLog.create({
      data: {
        tenantId,
        userId: user.id,
        accion: 'sync_n8n_workflows',
        entidad: 'N8nWorkflow',
        entidadId: 'batch',
        descripcion: `Sincronización de workflows: ${result.synced} total, ${result.added} nuevos`,
        cambiosDespues: result,
      },
    })

    return NextResponse.json({
      success: true,
      ...result,
    })
  } catch (error: any) {
    console.error('[API] Error syncing workflows:', error)
    return NextResponse.json(
      { error: error.message || 'Error sincronizando workflows' },
      { status: 500 }
    )
  }
}, ['automations:write'])

export const GET = withTenantAuth(async (req, auth) => {
  try {
    const tenantId = auth.tenant!.id
    const { searchParams } = new URL(req.url)
    const activeOnly = searchParams.get('activeOnly') !== 'false'

    const workflows = await automationService.listWorkflows(tenantId, activeOnly)

    return NextResponse.json({
      success: true,
      workflows,
    })
  } catch (error: any) {
    console.error('[API] Error listing workflows:', error)
    return NextResponse.json(
      { error: error.message || 'Error listando workflows' },
      { status: 500 }
    )
  }
}, ['automations:read'])
