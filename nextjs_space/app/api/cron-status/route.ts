import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { isAdminRequest } from '@/lib/auth-helpers'
import { getAllCronStatus } from '@/lib/cron/cron-status'

export const dynamic = 'force-dynamic'

// Estado de los jobs cron de la plataforma: solo operadores Superadmin.
export async function GET(request: NextRequest) {
  try {
    const auth = await isAdminRequest(request)
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: 401 })
    }

    const status = getAllCronStatus()

    return NextResponse.json({
      jobs: status,
      processUptime: Math.round(process.uptime()),
      processPid: process.pid,
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
