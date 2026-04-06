export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { executionQueue } from '@/lib/execution-queue'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

/**
 * POST /api/internal/queue/enqueue
 * Encola una nueva ejecución
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json(
        { error: 'No autorizado' },
        { status: 401 }
      )
    }

    const body = await req.json()
    const {
      type,
      targetId,
      payload,
      priority,
      maxAttempts,
      delayMs,
    } = body

    if (!type || !targetId) {
      return NextResponse.json(
        { error: 'type y targetId son requeridos' },
        { status: 400 }
      )
    }

    const tenantId = (session.user as any).tenantId
    if (!tenantId) {
      return NextResponse.json(
        { error: 'Tenant no encontrado' },
        { status: 400 }
      )
    }

    const executionId = await executionQueue.enqueue({
      tenantId,
      type,
      targetId,
      payload: payload || {},
      priority,
      maxAttempts,
      delayMs,
    })

    return NextResponse.json({
      success: true,
      executionId,
      message: 'Ejecución encolada',
    })
  } catch (error: any) {
    console.error('[Queue Enqueue] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Error encolando ejecución' },
      { status: 500 }
    )
  }
}
