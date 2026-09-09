export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { withPublicTenant } from '@/lib/api-key-auth'
import { sendEmail } from '@/lib/ses-email'
import { sendWhatsAppMessage } from '@/lib/whatsapp'
import {
  AcceptanceChannel,
  generateAcceptanceCode,
  generateChallengeToken,
  hashAcceptanceSecret,
  isValidAcceptanceDestination,
  maskEmail,
  maskPhone,
} from '@/lib/cotizaciones/acceptance-verification'

const CHALLENGE_TTL_MS = 10 * 60 * 1000
const RESEND_COOLDOWN_MS = 60 * 1000

function publicHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  }
}

function getDestination(cotizacion: any, channel: AcceptanceChannel): string | null {
  if (channel === 'email') {
    return cotizacion.clienteEmail || cotizacion.lead?.email || cotizacion.contacts?.email || null
  }
  return cotizacion.clienteTelefono || cotizacion.lead?.telefono || cotizacion.contacts?.telefono || null
}

function getAvailableChannels(cotizacion: any) {
  return (['email', 'whatsapp'] as AcceptanceChannel[])
    .map((channel) => {
      const destination = getDestination(cotizacion, channel)
      if (!isValidAcceptanceDestination(channel, destination)) return null
      return {
        channel,
        destinationMasked: channel === 'email' ? maskEmail(destination) : maskPhone(destination),
      }
    })
    .filter(Boolean)
}

async function loadCotizacion(cotizacionId: string, tenantId: string) {
  const cotizacion = await prisma.cotizacion.findUnique({
    where: { id: cotizacionId },
    include: {
      lead: { select: { email: true, telefono: true } },
      contacts: { select: { email: true, telefono: true } },
    },
  })

  if (!cotizacion || cotizacion.tenantId !== tenantId) {
    return { error: 'Cotización no encontrada', status: 404 as const }
  }
  if (['aceptada', 'rechazada'].includes(cotizacion.estado)) {
    return { error: `Esta cotización ya fue ${cotizacion.estado}`, status: 400 as const }
  }
  if (cotizacion.fechaVencimiento && new Date(cotizacion.fechaVencimiento) < new Date()) {
    return { error: 'Esta cotización ha expirado', status: 400 as const }
  }

  return { cotizacion }
}

export const GET = withPublicTenant(async (_req, tenantId, params) => {
  try {
    const result = await loadCotizacion(params.id, tenantId)
    if ('error' in result) {
      return NextResponse.json({ error: result.error }, { status: result.status, headers: publicHeaders() })
    }

    return NextResponse.json(
      { channels: getAvailableChannels(result.cotizacion) },
      { headers: publicHeaders() },
    )
  } catch (error) {
    console.error('Error consultando canales de verificación de cotización:', error)
    return NextResponse.json(
      { error: 'No se pudieron consultar los canales de verificación' },
      { status: 500, headers: publicHeaders() },
    )
  }
})

export const POST = withPublicTenant(async (req, tenantId, params) => {
  try {
    const body = await req.json()
    const channel = body.channel as AcceptanceChannel
    if (channel !== 'email' && channel !== 'whatsapp') {
      return NextResponse.json({ error: 'Canal de verificación inválido' }, { status: 400, headers: publicHeaders() })
    }

    const result = await loadCotizacion(params.id, tenantId)
    if ('error' in result) {
      return NextResponse.json({ error: result.error }, { status: result.status, headers: publicHeaders() })
    }

    const destination = getDestination(result.cotizacion, channel)
    if (!isValidAcceptanceDestination(channel, destination)) {
      return NextResponse.json(
        { error: `La cotización no tiene un ${channel === 'email' ? 'email' : 'teléfono de WhatsApp'} válido registrado` },
        { status: 422, headers: publicHeaders() },
      )
    }

    const cooldownSince = new Date(Date.now() - RESEND_COOLDOWN_MS)
    const recentChallenge = await prisma.cotizacionAcceptanceChallenge.findFirst({
      where: {
        cotizacionId: result.cotizacion.id,
        channel,
        createdAt: { gte: cooldownSince },
      },
      orderBy: { createdAt: 'desc' },
    })
    if (recentChallenge) {
      return NextResponse.json(
        { error: 'Espera un minuto antes de solicitar otro código', retryAfterSeconds: 60 },
        { status: 429, headers: publicHeaders() },
      )
    }

    const code = generateAcceptanceCode()
    const challengeToken = generateChallengeToken()
    const challenge = await prisma.cotizacionAcceptanceChallenge.create({
      data: {
        cotizacionId: result.cotizacion.id,
        tenantId,
        channel,
        destinationMasked: channel === 'email' ? maskEmail(destination) : maskPhone(destination),
        codeHash: hashAcceptanceSecret(code),
        challengeTokenHash: hashAcceptanceSecret(challengeToken),
        expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS),
      },
    })

    const message = `Código Volkern para aceptar la cotización ${result.cotizacion.numero}: ${code}. Caduca en 10 minutos. Si no solicitaste esta aceptación, ignora este mensaje.`
    const delivery = channel === 'email'
      ? await sendEmail({
          to: destination,
          subject: `Código para aceptar la cotización ${result.cotizacion.numero}`,
          text: message,
          html: `<p>${message}</p>`,
          tenantId,
        })
      // Fallback a número oficial de la plataforma si el tenant no tiene
      // WhatsApp propio: el código de aceptación no debe perderse.
      : await sendWhatsAppMessage(destination, message, tenantId, true)

    if (!delivery.success) {
      await prisma.cotizacionAcceptanceChallenge.delete({ where: { id: challenge.id } }).catch(() => {})
      return NextResponse.json(
        { error: 'No se pudo enviar el código. Comprueba el canal registrado.' },
        { status: 502, headers: publicHeaders() },
      )
    }

    return NextResponse.json(
      {
        challengeId: challenge.id,
        challengeToken,
        channel,
        destinationMasked: challenge.destinationMasked,
        expiresAt: challenge.expiresAt.toISOString(),
      },
      { headers: publicHeaders() },
    )
  } catch (error) {
    console.error('Error enviando código de aceptación de cotización:', error)
    return NextResponse.json(
      { error: 'No se pudo enviar el código de verificación' },
      { status: 500, headers: publicHeaders() },
    )
  }
})

export async function OPTIONS() {
  return NextResponse.json({}, { headers: publicHeaders() })
}
