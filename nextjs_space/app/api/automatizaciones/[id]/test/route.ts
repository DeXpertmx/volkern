export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { withTenantAuth } from '@/lib/api-key-auth'
import { AutomationEngine } from '@/lib/automation-engine'

export const POST = withTenantAuth(async (request, auth, { params }) => {
  try {
    const tenantId = auth.tenant!.id
    const body = await request.json()
    const { context } = body

    if (!context) {
      return NextResponse.json(
        { error: 'Se requiere un contexto de prueba' },
        { status: 400 }
      )
    }

    const automation = await prisma.automation.findFirst({
      where: { id: params.id, tenantId },
    })

    if (!automation) {
      return NextResponse.json(
        { error: 'Automatización no encontrada' },
        { status: 404 }
      )
    }

    const engine = new AutomationEngine(params.id, { ...context, tenantId })
    await engine.execute()

    return NextResponse.json({ 
      success: true,
      message: 'Automatización ejecutada en modo de prueba'
    })
  } catch (error: any) {
    console.error('Error al probar automatización:', error)
    return NextResponse.json(
      { error: error.message || 'Error al probar automatización' },
      { status: 500 }
    )
  }
}, ['automations:write'])
