import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')

  if (!code) {
    return NextResponse.json(
      { error: 'Código de confirmación requerido' },
      { status: 400 }
    )
  }

  try {
    const deletionRequest = await prisma.dataDeletionRequest.findUnique({
      where: { confirmationCode: code }
    })

    if (!deletionRequest) {
      return NextResponse.json(
        { error: 'Solicitud no encontrada. Verifica tu código e intenta nuevamente.' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      confirmationCode: deletionRequest.confirmationCode,
      status: deletionRequest.status,
      platform: deletionRequest.platform,
      statusUrl: deletionRequest.statusUrl,
      createdAt: deletionRequest.createdAt,
      processedAt: deletionRequest.processedAt,
      message: deletionRequest.status === 'completed' 
        ? 'Tu solicitud ha sido procesada exitosamente.'
        : deletionRequest.status === 'processing'
        ? 'Tu solicitud está siendo procesada.'
        : deletionRequest.status === 'rejected'
        ? 'Tu solicitud fue rechazada. Contacta soporte para más información.'
        : 'Tu solicitud está siendo revisada.'
    })
  } catch (error: any) {
    console.error('[GET /api/data-deletion/status] Error:', error)
    return NextResponse.json(
      { error: 'Error al consultar estado de la solicitud' },
      { status: 500 }
    )
  }
}