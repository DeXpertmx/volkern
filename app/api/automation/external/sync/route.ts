export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { automationService } from '@/lib/automation-service'
import { prisma } from '@/lib/db'

/**
 * POST /api/automation/external/sync
 * Sincroniza workflows desde n8n hacia Volkern
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email! },
      include: { tenant: true },
    })

    if (!user?.tenantId) {
      return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })
    }

    const result = await automationService.syncWorkflowsFromN8n(user.tenantId)

    // Log de auditoría
    await prisma.auditLog.create({
      data: {
        tenantId: user.tenantId,
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
}

/**
 * GET /api/automation/external/sync
 * Lista workflows sincronizados
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email! },
      include: { tenant: true },
    })

    if (!user?.tenantId) {
      return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })
    }

    const { searchParams } = new URL(req.url)
    const activeOnly = searchParams.get('activeOnly') !== 'false'

    const workflows = await automationService.listWorkflows(user.tenantId, activeOnly)

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
}
