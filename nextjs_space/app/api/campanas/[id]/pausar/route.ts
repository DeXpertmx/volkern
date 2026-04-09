export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { withTenantAuth } from '@/lib/api-key-auth'
import { pauseCampaign } from '@/lib/campaign-engine'

// POST /api/campanas/[id]/pausar - Pausar campaña
export const POST = withTenantAuth(async (request, auth, params) => {
  try {
    const tenantId = auth.tenant!.id

    const campana = await prisma.campaign.findFirst({
      where: { id: params.id, tenantId }
    })

    if (!campana) {
      return NextResponse.json({ error: 'Campaña no encontrada' }, { status: 404 })
    }

    if (campana.estado !== 'en_curso') {
      return NextResponse.json(
        { error: 'Solo se pueden pausar campañas en ejecución' },
        { status: 400 }
      )
    }

    await pauseCampaign(params.id, tenantId)

    return NextResponse.json({
      success: true,
      message: 'Campaña pausada'
    })
  } catch (error: any) {
    console.error('Error al pausar campaña:', error)
    return NextResponse.json(
      { error: 'Error al pausar campaña', details: error.message },
      { status: 500 }
    )
  }
}, ['campaigns:write'])