export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { withTenantAuth } from '@/lib/api-key-auth'

export const POST = withTenantAuth(async (request, auth, { params }) => {
  try {
    const tenantId = auth.tenant!.id

    const original = await prisma.automation.findFirst({
      where: { id: params.id, tenantId }
    })

    if (!original) {
      return NextResponse.json(
        { error: 'Automatización no encontrada' },
        { status: 404 }
      )
    }

    const duplicate = await prisma.automation.create({
      data: {
        nombre: `${original.nombre} (Copia)`,
        descripcion: original.descripcion,
        trigger: original.trigger,
        flowData: original.flowData as any,
        activo: false,
        tenantId,
      }
    })

    return NextResponse.json(duplicate)
  } catch (error) {
    console.error('Error al duplicar automatización:', error)
    return NextResponse.json(
      { error: 'Error al duplicar automatización' },
      { status: 500 }
    )
  }
}, ['automations:write'])
