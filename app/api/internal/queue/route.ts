export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { executionQueue } from '@/lib/execution-queue'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

/**
 * POST /api/internal/queue
 * Procesa la cola de ejecuciones pendientes
 * Puede ser llamado por un cron job o manualmente
 */
export async function POST(req: NextRequest) {
  try {
    // Verificar autorización - solo admin o sistema
    const authHeader = req.headers.get('authorization')
    const internalSecret = process.env.INTERNAL_API_SECRET

    let isAuthorized = false

    // Verificar secret interno
    if (internalSecret && authHeader === `Bearer ${internalSecret}`) {
      isAuthorized = true
    }

    // O verificar sesión de admin
    if (!isAuthorized) {
      const session = await getServerSession(authOptions)
      if (session?.user?.role === 'super_admin') {
        isAuthorized = true
      }
    }

    if (!isAuthorized) {
      return NextResponse.json(
        { error: 'No autorizado' },
        { status: 401 }
      )
    }

    // Procesar cola
    const result = await executionQueue.processQueue()

    return NextResponse.json({
      success: true,
      ...result,
      timestamp: new Date().toISOString(),
    })
  } catch (error: any) {
    console.error('[Queue API] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Error procesando cola' },
      { status: 500 }
    )
  }
}

/**
 * GET /api/internal/queue
 * Obtiene estadísticas de la cola
 */
export async function GET(req: NextRequest) {
  try {
    // Verificar autorización
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json(
        { error: 'No autorizado' },
        { status: 401 }
      )
    }

    const stats = await executionQueue.getStats()

    return NextResponse.json({
      success: true,
      stats,
      timestamp: new Date().toISOString(),
    })
  } catch (error: any) {
    console.error('[Queue API] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Error obteniendo estadísticas' },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/internal/queue
 * Limpia ejecuciones antiguas
 */
export async function DELETE(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (session?.user?.role !== 'super_admin') {
      return NextResponse.json(
        { error: 'Solo super_admin puede limpiar la cola' },
        { status: 403 }
      )
    }

    const { searchParams } = new URL(req.url)
    const days = parseInt(searchParams.get('days') || '7')

    const deletedCount = await executionQueue.cleanup(days)

    return NextResponse.json({
      success: true,
      deleted: deletedCount,
      olderThanDays: days,
    })
  } catch (error: any) {
    console.error('[Queue API] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Error limpiando cola' },
      { status: 500 }
    )
  }
}
