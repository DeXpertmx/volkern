import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import crypto from 'crypto'

function generateConfirmationCode(): string {
  return crypto.randomBytes(4).toString('hex').toUpperCase()
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { platform, userEmail, userPhone, reason } = body

    if (!platform || !userEmail) {
      return NextResponse.json(
        { error: 'Plataforma y correo electrónico son requeridos' },
        { status: 400 }
      )
    }

    const confirmationCode = generateConfirmationCode()
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://volkern.app'
    const statusUrl = `${baseUrl}/delete-data?code=${confirmationCode}`

    const deletionRequest = await prisma.dataDeletionRequest.create({
      data: {
        platform,
        userEmail,
        userPhone,
        confirmationCode,
        statusUrl,
        status: 'pending',
        deletionDetails: {
          reason,
          requestedAt: new Date().toISOString(),
          platforms: [platform]
        }
      }
    })

    return NextResponse.json({
      success: true,
      confirmationCode: deletionRequest.confirmationCode,
      statusUrl: deletionRequest.statusUrl,
      message: 'Solicitud de eliminación creada exitosamente'
    })
  } catch (error: any) {
    console.error('[POST /api/data-deletion/request] Error:', error)
    return NextResponse.json(
      { error: 'Error al crear solicitud de eliminación' },
      { status: 500 }
    )
  }
}

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
        { error: 'Solicitud no encontrada' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      confirmationCode: deletionRequest.confirmationCode,
      status: deletionRequest.status,
      platform: deletionRequest.platform,
      statusUrl: deletionRequest.statusUrl,
      createdAt: deletionRequest.createdAt,
      processedAt: deletionRequest.processedAt
    })
  } catch (error: any) {
    console.error('[GET /api/data-deletion/request] Error:', error)
    return NextResponse.json(
      { error: 'Error al consultar solicitud' },
      { status: 500 }
    )
  }
}