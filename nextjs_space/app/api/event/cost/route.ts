export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { CostControl } from '@/lib/event-engine'

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const usage = await CostControl.getUsage(session.user.tenantId)
    const config = await CostControl.getConfig(session.user.tenantId)

    return NextResponse.json({
      usage,
      config,
      remaining: {
        daily: config.max_ai_per_day - usage.daily,
        monthly: config.max_ai_per_month - usage.monthly
      }
    })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}