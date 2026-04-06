export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server'
import { processScheduledAutomationTasks } from '@/lib/automation-engine'

/**
 * Endpoint para procesar tareas programadas (delays)
 * Este endpoint debe llamarse periódicamente mediante un cron job
 * o servicio externo cada minuto
 */
export async function POST(request: NextRequest) {
  try {
    // Verificar authorization header (opcional, para seguridad)
    const authHeader = request.headers.get('authorization')
    const cronSecret = process.env.CRON_SECRET || 'dev-secret'

    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json(
        { error: 'No autorizado' },
        { status: 401 }
      )
    }

    const processedCount = await processScheduledAutomationTasks()

    return NextResponse.json({
      success: true,
      processedTasks: processedCount,
      timestamp: new Date().toISOString()
    })
  } catch (error: any) {
    console.error('Error procesando tareas programadas:', error)
    return NextResponse.json(
      { error: error.message || 'Error procesando tareas programadas' },
      { status: 500 }
    )
  }
}

// También permitir GET para debugging
export async function GET(request: NextRequest) {
  try {
    const processedCount = await processScheduledAutomationTasks()

    return NextResponse.json({
      success: true,
      processedTasks: processedCount,
      timestamp: new Date().toISOString()
    })
  } catch (error: any) {
    console.error('Error procesando tareas programadas:', error)
    return NextResponse.json(
      { error: error.message || 'Error procesando tareas programadas' },
      { status: 500 }
    )
  }
}
