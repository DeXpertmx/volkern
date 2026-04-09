export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server'
import { processScheduledCampaigns } from '@/lib/campaign-engine'

const CRON_SECRET = process.env.CRON_SECRET

function verifyCronAuth(request: NextRequest): boolean {
  if (!CRON_SECRET) {
    console.error('CRON_SECRET no configurado')
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

    const processedCount = await processScheduledCampaigns()

    return NextResponse.json({
      success: true,
      processedCampaigns: processedCount,
      timestamp: new Date().toISOString()
    })
  } catch (error: any) {
    console.error('Error procesando campañas programadas:', error)
    return NextResponse.json(
      { error: error.message || 'Error procesando campañas' },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  return POST(request)
}