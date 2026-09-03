import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { processDataDeletionRequest } from '@/lib/services/data-deletion'
import { isSuperadminRequest } from '@/lib/auth-helpers'

export async function GET(request: NextRequest) {
  try {
    // Solo operadores Superadmin de la plataforma
    const auth = await isSuperadminRequest()
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error || 'No autorizado' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')

    const whereClause: any = {}
    if (status && status !== 'all') {
      whereClause.status = status
    }

    const requests = await prisma.dataDeletionRequest.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' },
      take: 100
    })

    return NextResponse.json({ requests })
  } catch (error: any) {
    console.error('[GET /api/admin/data-deletion] Error:', error)
    return NextResponse.json({ error: 'Error al obtener solicitudes' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    // Solo operadores Superadmin de la plataforma
    const auth = await isSuperadminRequest()
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error || 'No autorizado' }, { status: 403 })
    }

    const body = await request.json()
    const { requestId, action } = body

    if (!requestId || !action) {
      return NextResponse.json(
        { error: 'requestId y action son requeridos' },
        { status: 400 }
      )
    }

    if (action === 'process') {
      const success = await processDataDeletionRequest(requestId)
      
      if (success) {
        return NextResponse.json({ 
          success: true, 
          message: 'Solicitud procesada exitosamente' 
        })
      } else {
        return NextResponse.json({ 
          error: 'Error al procesar la solicitud' 
        }, { status: 500 })
      }
    }

    if (action === 'reject') {
      await prisma.dataDeletionRequest.update({
        where: { id: requestId },
        data: {
          status: 'rejected',
          processedAt: new Date(),
          deletionDetails: {
            rejectedAt: new Date().toISOString(),
            reason: body.reason || 'Rechazado por administrador'
          }
        }
      })

      return NextResponse.json({ 
        success: true, 
        message: 'Solicitud rechazada' 
      })
    }

    return NextResponse.json({ error: 'Acción no válida' }, { status: 400 })
  } catch (error: any) {
    console.error('[POST /api/admin/data-deletion] Error:', error)
    return NextResponse.json({ error: 'Error al procesar solicitud' }, { status: 500 })
  }
}