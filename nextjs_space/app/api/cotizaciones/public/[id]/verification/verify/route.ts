export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { prisma } from '@/lib/db'
import { withPublicTenant } from '@/lib/api-key-auth'
import { acceptCotizacionFromPublicLink } from '@/lib/cotizaciones/accept-cotizacion'
import { matchesAcceptanceSecret } from '@/lib/cotizaciones/acceptance-verification'

function publicHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  }
}

export const POST = withPublicTenant(async (req, tenantId, params) => {
  try {
    const body = await req.json()
    const { challengeId, challengeToken, code } = body
    if (!challengeId || !challengeToken || !/^\d{6}$/.test(String(code || ''))) {
      return NextResponse.json(
        { error: 'Código de verificación incompleto' },
        { status: 400, headers: publicHeaders() },
      )
    }

    const challenge = await prisma.cotizacionAcceptanceChallenge.findUnique({
      where: { id: challengeId },
    })
    if (!challenge || challenge.cotizacionId !== params.id || challenge.tenantId !== tenantId) {
      return NextResponse.json({ error: 'Código inválido o caducado' }, { status: 400, headers: publicHeaders() })
    }
    if (challenge.verifiedAt || challenge.attempts >= challenge.maxAttempts || challenge.expiresAt < new Date()) {
      return NextResponse.json({ error: 'Código inválido o caducado' }, { status: 400, headers: publicHeaders() })
    }

    await prisma.cotizacionAcceptanceChallenge.update({
      where: { id: challenge.id },
      data: { attempts: { increment: 1 } },
    })

    if (
      !matchesAcceptanceSecret(String(code), challenge.codeHash) ||
      !matchesAcceptanceSecret(String(challengeToken), challenge.challengeTokenHash)
    ) {
      const remainingAttempts = Math.max(0, challenge.maxAttempts - challenge.attempts - 1)
      return NextResponse.json(
        {
          error: remainingAttempts > 0 ? 'Código inválido' : 'Código bloqueado por demasiados intentos',
          remainingAttempts,
        },
        { status: 400, headers: publicHeaders() },
      )
    }

    const headersList = await headers()
    const forwardedFor = headersList.get('x-forwarded-for')
    const ip = forwardedFor ? forwardedFor.split(',')[0].trim() : 'unknown'
    const accepted = await acceptCotizacionFromPublicLink({
      cotizacionId: params.id,
      tenantId,
      ip,
    })
    if (!accepted.ok) {
      return NextResponse.json({ error: accepted.error }, { status: accepted.status, headers: publicHeaders() })
    }

    await prisma.cotizacionAcceptanceChallenge.update({
      where: { id: challenge.id },
      data: { verifiedAt: new Date() },
    })

    return NextResponse.json(
      { success: true, message: 'Cotización aceptada y verificada correctamente' },
      { headers: publicHeaders() },
    )
  } catch (error) {
    console.error('Error verificando aceptación de cotización:', error)
    return NextResponse.json(
      { error: 'Error al verificar la aceptación' },
      { status: 500, headers: publicHeaders() },
    )
  }
})

export async function OPTIONS() {
  return NextResponse.json({}, { headers: publicHeaders() })
}
