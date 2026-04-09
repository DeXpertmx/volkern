export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server'
import { processAppointmentReminders } from '@/lib/automation-engine'

/**
 * POST /api/citas/recordatorios/procesar
 * Procesa y envía recordatorios de citas pendientes
 * Se llama desde cron job cada 5-15 minutos
 * También puede llamarse manualmente desde el cron de automatizaciones
 */
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    const cronSecret = process.env.CRON_SECRET

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json(
        { error: 'No autorizado' },
        { status: 401 }
      )
    }

    const remindersSent = await processAppointmentReminders()

    return NextResponse.json({
      success: true,
      remindersSent,
      timestamp: new Date().toISOString()
    })
  } catch (error: any) {
    console.error('Error procesando recordatorios:', error)
    return NextResponse.json(
      { error: error.message || 'Error procesando recordatorios' },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  return POST(request)
}
