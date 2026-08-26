import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getRateLimitMetrics } from '@/lib/telegram/rate-limit-metrics'

export const dynamic = 'force-dynamic'

/**
 * GET /api/webhook-status
 *
 * Métricas de rate-limit de los webhooks (Telegram + Evolution/WhatsApp):
 * cuántos mensajes se rechazan con 429 por chat y por día.
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const metrics = await getRateLimitMetrics()

    return NextResponse.json({
      metrics,
      processUptime: Math.round(process.uptime()),
      processPid: process.pid,
      timestamp: new Date().toISOString(),
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
