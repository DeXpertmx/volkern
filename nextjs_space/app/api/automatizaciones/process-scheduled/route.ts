export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server'
import { processScheduledAutomationTasks, processAppointmentReminders, processPaymentReminders } from '@/lib/automation-engine'
import { processScheduledCampaigns } from '@/lib/campaign-engine'

const CRON_SECRET = process.env.CRON_SECRET

function verifyCronAuth(request: NextRequest): boolean {
  if (!CRON_SECRET) {
    console.error('CRON_SECRET no configurado - endpoint de tareas programadas deshabilitado')
    return false
  }

  const authHeader = request.headers.get('authorization')
  const headerToken = request.headers.get('x-cron-secret')

  if (authHeader === `Bearer ${CRON_SECRET}`) return true
  if (headerToken === CRON_SECRET) return true

  return false
}

export async function POST(request: NextRequest) {
  try {
    if (!verifyCronAuth(request)) {
      return NextResponse.json(
        { error: 'No autorizado. CRON_SECRET requerido.' },
        { status: 401 }
      )
    }

    const processedCount = await processScheduledAutomationTasks()
    const remindersSent = await processAppointmentReminders()
    const campaignsProcessed = await processScheduledCampaigns()
    const paymentRemindersSent = await processPaymentReminders()

    return NextResponse.json({
      success: true,
      processedTasks: processedCount,
      remindersSent,
      campaignsProcessed,
      paymentRemindersSent,
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

export async function GET(request: NextRequest) {
  try {
    if (!verifyCronAuth(request)) {
      return NextResponse.json(
        { error: 'No autorizado. CRON_SECRET requerido.' },
        { status: 401 }
      )
    }

    const processedCount = await processScheduledAutomationTasks()
    const remindersSent = await processAppointmentReminders()
    const campaignsProcessed = await processScheduledCampaigns()
    const paymentRemindersSent = await processPaymentReminders()

    return NextResponse.json({
      success: true,
      processedTasks: processedCount,
      remindersSent,
      campaignsProcessed,
      paymentRemindersSent,
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
