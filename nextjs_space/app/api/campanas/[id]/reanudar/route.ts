export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { withTenantAuth } from '@/lib/api-key-auth'
import { resumeCampaign } from '@/lib/campaign-engine'

// POST /api/campanas/[id]/reanudar - Reanudar campaña
export const POST = withTenantAuth(async (request, auth, params) => {
  try {
    const tenantId = auth.tenant!.id

    const campana = await prisma.campaign.findFirst({
      where: { id: params.id, tenantId }
    })

    if (!campana) {
      return NextResponse.json({ error: 'Campaña no encontrada' }, { status: 404 })
    }

    if (campana.estado !== 'pausada') {
      return NextResponse.json(
        { error: 'Solo se pueden reanudar campañas pausadas' },
        { status: 400 }
      )
    }

    resumeCampaign(params.id, tenantId).catch(error => {
      console.error('Error al reanudar campaña:', error)
    })

    return NextResponse.json({
      success: true,
      message: 'Campaña reanudada'
    })
  } catch (error: any) {
    console.error('Error al reanudar campaña:', error)
    return NextResponse.json(
      { error: 'Error al reanudar campaña', details: error.message },
      { status: 500 }
    )
  }
}, ['campaigns:write'])