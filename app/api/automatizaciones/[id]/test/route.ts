export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { AutomationEngine } from '@/lib/automation-engine'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const body = await request.json()
    const { context } = body

    if (!context) {
      return NextResponse.json(
        { error: 'Se requiere un contexto de prueba' },
        { status: 400 }
      )
    }

    // Ejecutar la automatización en modo de prueba
    const engine = new AutomationEngine(params.id, context)
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
}
