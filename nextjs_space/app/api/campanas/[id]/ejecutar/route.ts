export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { withTenantAuth } from '@/lib/api-key-auth'
import { executeCampaign } from '@/lib/campaign-engine'

// POST /api/campanas/[id]/ejecutar - Ejecutar campaña
export const POST = withTenantAuth(async (request, auth, { params }) => {
  try {
    const tenantId = auth.tenant!.id
    console.log('[EjecutarCampaña] Tenant:', tenantId, 'Campaign:', params.id)

    const campana = await prisma.campaign.findFirst({
      where: { id: params.id, tenantId }
    })

    if (!campana) {
      console.log('[EjecutarCampaña] Campaña no encontrada:', params.id)
      return NextResponse.json({ error: 'Campaña no encontrada' }, { status: 404 })
    }

    console.log('[EjecutarCampaña] Estado campaña:', campana.estado)

    if (campana.estado !== 'borrador' && campana.estado !== 'programada' && campana.estado !== 'pausada') {
      return NextResponse.json(
        { error: 'La campaña no puede ejecutarse en su estado actual' },
        { status: 400 }
      )
    }

    executeCampaign(params.id, tenantId).catch(error => {
      console.error('[EjecutarCampaña] Error en ejecución:', error)
    })

    return NextResponse.json({
      success: true,
      message: 'Campaña en ejecución'
    })
  } catch (error: any) {
    console.error('[EjecutarCampaña] Error:', error)
    return NextResponse.json(
      { error: 'Error al ejecutar campaña', details: error.message },
      { status: 500 }
    )
  }
}, ['campaigns:write'])