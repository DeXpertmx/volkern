export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { withTenantAuth } from '@/lib/api-key-auth'
import { cancelCampaign } from '@/lib/campaign-engine'

// POST /api/campanas/[id]/cancelar - Cancelar campaña
export const POST = withTenantAuth(async (request, auth, params) => {
  try {
    const tenantId = auth.tenant!.id

    const campana = await prisma.campaign.findFirst({
      where: { id: params.id, tenantId }
    })

    if (!campana) {
      return NextResponse.json({ error: 'Campaña no encontrada' }, { status: 404 })
    }

    if (campana.estado === 'completada' || campana.estado === 'cancelada') {
      return NextResponse.json(
        { error: 'No se puede cancelar una campaña completada o ya cancelada' },
        { status: 400 }
      )
    }

    await cancelCampaign(params.id, tenantId)

    return NextResponse.json({
      success: true,
      message: 'Campaña cancelada'
    })
  } catch (error: any) {
    console.error('Error al cancelar campaña:', error)
    return NextResponse.json(
      { error: 'Error al cancelar campaña', details: error.message },
      { status: 500 }
    )
  }
}, ['campaigns:write'])