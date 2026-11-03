export const dynamic = 'force-dynamic';

/**
 * Webhook de TikTok (Content Posting API).
 *
 * TikTok exige una Callback URL HTTPS al configurar la app. Este receptor valida
 * la firma `TikTok-Signature: t=<timestamp>,s=<hmac>` —HMAC-SHA256 de
 * `"<timestamp>.<cuerpo crudo>"` con el client secret—, rechaza entregas viejas
 * (replay) y responde 200 para que TikTok no reintente.
 *
 * Los eventos que nos interesan son `authorization.removed` (el usuario revocó el
 * acceso desde TikTok, hay que invalidar el token guardado) y los de estado de
 * publicación. Hoy solo se registran: si el token se revoca, la propia API de
 * publicación falla y la UI ofrece reconectar.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createHmac, timingSafeEqual } from 'node:crypto'

/** Ventana máxima entre el envío y la recepción del evento. */
const TOLERANCIA_MS = 5 * 60 * 1000

function firmaValida(cabecera: string | null, cuerpoCrudo: string, secreto: string): boolean {
  if (!cabecera) return false

  const partes = new Map(
    cabecera.split(',').map((trozo) => {
      const [clave, valor] = trozo.split('=')
      return [clave?.trim() ?? '', valor?.trim() ?? '']
    }),
  )

  const t = partes.get('t')
  const s = partes.get('s')
  if (!t || !s) return false

  const emision = Number(t)
  if (!Number.isFinite(emision)) return false
  if (Math.abs(Date.now() - emision * 1000) > TOLERANCIA_MS) return false

  const esperada = createHmac('sha256', secreto)
    .update(`${t}.${cuerpoCrudo}`, 'utf8')
    .digest('hex')

  const a = Buffer.from(esperada, 'utf8')
  const b = Buffer.from(s, 'utf8')
  return a.length === b.length && timingSafeEqual(a, b)
}

export async function POST(request: NextRequest) {
  const secreto = process.env.TIKTOK_CLIENT_SECRET
  if (!secreto) {
    // Sin secreto no se puede verificar la firma: mejor rechazar que aceptar a ciegas.
    return NextResponse.json(
      { error: 'tiktok_webhook_not_configured', message: 'Falta TIKTOK_CLIENT_SECRET' },
      { status: 503 },
    )
  }

  const cuerpoCrudo = await request.text()

  if (!firmaValida(request.headers.get('TikTok-Signature'), cuerpoCrudo, secreto)) {
    return NextResponse.json({ error: 'invalid_signature' }, { status: 401 })
  }

  let evento: string | undefined
  try {
    const payload = JSON.parse(cuerpoCrudo)
    evento = payload?.event ?? payload?.type
  } catch {
    return NextResponse.json({ error: 'invalid_payload' }, { status: 400 })
  }

  // Solo el nombre del evento: el cuerpo puede llevar datos del creador.
  console.log(`[tiktok-webhook] evento recibido: ${evento ?? 'desconocido'}`)

  return NextResponse.json({ status: 'ok' })
}
